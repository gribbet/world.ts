import type { mat4 } from "gl-matrix";
import { vec2, vec3, vec4 } from "gl-matrix";

import type { Buffer } from "../../buffer";
import { createBuffer } from "../../buffer";
import { range } from "../../common";
import type { Context } from "../../context";
import { createElevation } from "../../elevation";
import type { Viewport } from "../../viewport";
import type { Layer, Properties, Terrain } from "..";
import { cache, createMouseEvents } from "..";
import { configure, to } from "../common";
import depthSource from "../depth.glsl";
import fragmentSource from "./fragment.glsl";
import type { Texture } from "./texture";
import type { TileCache } from "./tile-cache";
import { createTileCache } from "./tile-cache";
import type { TileDownsampler } from "./tile-downsampler";
import { createTileDownsampler } from "./tile-downsampler";
import { createTileShapes } from "./tile-shapes";
import vertexSource from "./vertex.glsl";

const n = 34;

const maxZ = 22;

const indices = range(0, n).flatMap(y =>
  range(0, n).flatMap(x => [
    y * (n + 1) + x,
    y * (n + 1) + x + 1,
    (y + 1) * (n + 1) + x + 1,
    y * (n + 1) + x,
    (y + 1) * (n + 1) + x + 1,
    (y + 1) * (n + 1) + x,
  ]),
);

const skirt = 0.1;
const uvw = range(0, n + 1).flatMap(y =>
  range(0, n + 1).map(x => {
    let u = (x - 1) / (n - 2);
    let v = (y - 1) / (n - 2);
    let w = 0;
    if (x === 0) {
      u = 0;
      w = -skirt;
    }
    if (x === n) {
      u = 1;
      w = -skirt;
    }
    if (y === 0) {
      v = 0;
      w = -skirt;
    }
    if (y === n) {
      v = 1;
      w = -skirt;
    }

    return [u, v, w] as vec3;
  }),
);

export type TerrainLayer = Layer & {
  elevation: (_: vec2) => number;
};

export const createTerrainLayer = (
  context: Context,
  properties: Properties<Partial<Terrain>> = {},
) => {
  const { gl } = context;

  let imageryCache: TileCache | undefined;
  let imageryDownsampler: TileDownsampler | undefined;

  const textureFilterAnisotropic = gl.getExtension(
    "EXT_texture_filter_anisotropic",
  );
  const maxAnisotropy = textureFilterAnisotropic
    ? (gl.getParameter(
        textureFilterAnisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT,
      ) as number | undefined)
    : undefined;

  const updateImageryUrl = cache(
    () => properties.imageryUrl?.() ?? "",
    imageryUrl => {
      imageryCache?.dispose();
      imageryCache = createTileCache({
        gl,
        urlPattern: imageryUrl,
        onLoad: () => {
          if (textureFilterAnisotropic && maxAnisotropy)
            gl.texParameterf(
              gl.TEXTURE_2D,
              textureFilterAnisotropic.TEXTURE_MAX_ANISOTROPY_EXT,
              maxAnisotropy,
            );
          gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_MIN_FILTER,
            gl.LINEAR_MIPMAP_LINEAR,
          );
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.generateMipmap(gl.TEXTURE_2D);
        },
      });
      imageryDownsampler = createTileDownsampler(imageryCache);
    },
  );

  const terrainUrl = properties.terrainUrl?.() ?? "";

  const terrainCache = createTileCache({
    gl,
    urlPattern: terrainUrl,
    onLoad: () => {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    },
  });

  const terrainDownsampler = createTileDownsampler(terrainCache, 3);
  const elevation = createElevation({ gl, terrainCache });
  const tileShapes = createTileShapes(elevation);

  const uvwBuffer = createBuffer({ gl, type: "f32", target: "array" });
  uvwBuffer.set(uvw.flatMap(([x = 0, y = 0, z = 0]) => [x, y, z]));

  const indexBuffer = createBuffer({ gl, type: "u16", target: "element" });
  indexBuffer.set(indices);

  const { renderProgram, depthProgram } = createPrograms(context, {
    uvwBuffer,
    indexBuffer,
  });

  const q = [0, 1, 2, 3];
  const vec3s = q.map(vec3.create);
  const vec4s = q.map(vec4.create);
  const vec2s = q.map(vec2.create);

  const calculateVisibleTiles = (viewport: Viewport) => {
    const stack = new Array<vec3>([0, 0, 0]);
    const tiles = new Array<vec3>();
    const { worldToLocal, localToClip, clipToScreen } = viewport;

    const tileSize = 384 * Math.pow(2, properties.downsample?.() ?? 0);

    for (;;) {
      const xyz = stack.pop();
      if (!xyz) break;
      const [x = 0, y = 0, z = 0] = xyz;
      const shape = tileShapes.get(xyz);
      const clip = shape
        .map((_, i) => worldToLocal(_, vec3s[i]))
        .map((_, i) => localToClip(_, vec4s[i]));
      if (clipped(clip)) continue;
      const size = screenSize(
        fixOutsideFarNearPlanes(clip).map((_, i) => clipToScreen(_, vec2s[i])),
      );
      const split = size > tileSize;
      if (split && z < maxZ)
        stack.push(
          [2 * x, 2 * y, z + 1],
          [2 * x + 1, 2 * y, z + 1],
          [2 * x, 2 * y + 1, z + 1],
          [2 * x + 1, 2 * y + 1, z + 1],
        );
      else tiles.push(xyz);
    }

    return tiles;
  };

  const render = ({
    viewport,
    depth = false,
    index = 0,
  }: {
    viewport: Viewport;
    depth?: boolean;
    index?: number;
  }) => {
    const color = properties.color?.() ?? [1, 1, 1, 1];
    const saturation = properties.saturation?.() ?? 1;

    updateImageryUrl();

    if (configure(gl, depth, properties)) return;

    const program = depth ? depthProgram : renderProgram;

    const { projection, modelView, camera } = viewport;

    const visible = calculateVisibleTiles(viewport);

    for (const xyz of visible) {
      const downsampledImagery = depth
        ? undefined
        : imageryDownsampler?.get(xyz);
      const downsampledTerrain = terrainDownsampler.get(xyz);
      if ((!depth && !downsampledImagery) || !downsampledTerrain) continue;
      const { texture: terrain, downsample: downsampleTerrain } =
        downsampledTerrain;
      const { texture: imagery = terrain, downsample: downsampleImagery = 0 } =
        downsampledImagery ?? {};

      program.execute({
        projection,
        modelView,
        camera: to(camera),
        xyz,
        imagery,
        terrain,
        downsampleImagery,
        downsampleTerrain,
        color,
        saturation,
        index,
      });
    }
  };

  const dispose = () => {
    imageryCache?.dispose();
    terrainCache.dispose();
    elevation.dispose();
  };

  const mouseEvents = createMouseEvents(properties);

  return {
    render,
    dispose,
    ...mouseEvents,
    elevation: elevation.get,
  } satisfies TerrainLayer;
};

const createPrograms = (
  { gl, programs }: Context,
  { uvwBuffer, indexBuffer }: { uvwBuffer: Buffer; indexBuffer: Buffer },
) => {
  const createRenderProgram = (depth = false) => {
    const program = programs.get({
      vertexSource,
      fragmentSource: depth ? depthSource : fragmentSource,
    });

    const uvwAttribute = program.attribute3f("uvw", uvwBuffer);

    const projectionUniform = program.uniformMatrix4f("projection");
    const modelViewUniform = program.uniformMatrix4f("model_view");
    const imageryUniform = program.uniform1i("imagery");
    const terrainUniform = program.uniform1i("terrain");
    const downsampleImageryUniform = program.uniform1i("downsample_imagery");
    const downsampleTerrainUniform = program.uniform1i("downsample_terrain");
    const colorUniform = program.uniform4f("color");
    const saturationUniform = program.uniform1f("saturation");
    const xyzUniform = program.uniform3i("xyz");
    const cameraUniform = program.uniform3i("camera");
    const indexUniform = program.uniform1i("index");

    const execute = ({
      projection,
      modelView,
      camera,
      xyz,
      imagery,
      terrain,
      downsampleImagery,
      downsampleTerrain,
      color,
      saturation,
      index,
    }: {
      projection: mat4;
      modelView: mat4;
      camera: vec3;
      xyz: vec3;
      imagery: Texture;
      terrain: Texture;
      downsampleImagery: number;
      downsampleTerrain: number;
      color: vec4;
      saturation: number;
      index: number;
    }) => {
      program.use();

      uvwAttribute.use();

      projectionUniform.set(projection);
      modelViewUniform.set(modelView);
      xyzUniform.set(xyz);
      cameraUniform.set(camera);
      downsampleImageryUniform.set(downsampleImagery);
      downsampleTerrainUniform.set(downsampleTerrain);
      colorUniform.set(color);
      saturationUniform.set(saturation);
      indexUniform.set(index);

      gl.activeTexture(gl.TEXTURE0);
      imageryUniform.set(0);
      imagery.use();

      gl.activeTexture(gl.TEXTURE1);
      terrainUniform.set(1);
      terrain.use();

      indexBuffer.use();
      gl.drawElements(gl.TRIANGLES, n * n * 2 * 3, gl.UNSIGNED_SHORT, 0);
    };

    return { execute };
  };

  const renderProgram = createRenderProgram();
  const depthProgram = createRenderProgram(true);

  return { renderProgram, depthProgram };
};

const clipped = (clip: vec4[]) =>
  clip.every(([x = 0, , , w = 0]) => x > w) ||
  clip.every(([x = 0, , , w = 0]) => x < -w) ||
  clip.every(([, y = 0, , w = 0]) => y > w) ||
  clip.every(([, y = 0, , w = 0]) => y < -w) ||
  clip.every(([, , z = 0, w = 0]) => z > w) ||
  clip.every(([, , z = 0]) => z < 0);

const screenSize = (screen: vec2[]) =>
  Math.sqrt(
    screen
      .map((_, i) =>
        vec2.squaredDistance(
          screen[i] ?? [0, 0],
          screen[(i + 1) % screen.length] ?? [0, 0],
        ),
      )
      .reduce((a, b) => a + b, 0) / screen.length,
  );

const sutherlandHodgman = (vertices: vec4[], plane: vec4) => {
  const [a = 0, b = 0, c = 0, d = 0] = plane;

  const isInside = ([x = 0, y = 0, z = 0, w = 0]: vec4) =>
    a * x + b * y + c * z + d * w >= 0;

  const intersection = (
    [x1 = 0, y1 = 0, z1 = 0, w1 = 0]: vec4,
    [x2 = 0, y2 = 0, z2 = 0, w2 = 0]: vec4,
  ) => {
    const d1 = a * x1 + b * y1 + c * z1 + d * w1;
    const d2 = a * x2 + b * y2 + c * z2 + d * w2;

    const t = d1 / (d1 - d2);

    const x = x1 + t * (x2 - x1);
    const y = y1 + t * (y2 - y1);
    const z = z1 + t * (z2 - z1);
    const w = w1 + t * (w2 - w1);

    return [x, y, z, w] satisfies vec4;
  };

  const clipped: vec4[] = [];
  let previous = vertices[vertices.length - 1] ?? [0, 0, 0, 0];

  for (const vertex of vertices) {
    if (isInside(vertex))
      if (isInside(previous)) clipped.push(vertex);
      else {
        clipped.push(intersection(previous, vertex));
        clipped.push(vertex);
      }
    else if (isInside(previous)) clipped.push(intersection(previous, vertex));

    previous = vertex;
  }

  return clipped;
};

const fixOutsideFarNearPlanes = (clip: vec4[]) =>
  sutherlandHodgman(sutherlandHodgman(clip, [0, 0, 1, 0]), [0, 0, -1, 1]);
