import type { mat4 } from "gl-matrix";
import { vec2, vec3, vec4 } from "gl-matrix";

import { createBuffer } from "../../buffer";
import { range } from "../../common";
import { createElevation } from "../../elevation";
import { createProgram } from "../../program";
import type { Viewport } from "../../viewport";
import type { World } from "../../world";
import type { LayerOptions } from "..";
import { type BaseLayer, type Terrain } from "..";
import { configure, to } from "../common";
import depthSource from "../depth.glsl";
import fragmentSource from "./fragment.glsl";
import type { Texture } from "./texture";
import { TileCache, createTileCache } from "./tile-cache";
import { TileDownsampler, createTileDownsampler } from "./tile-downsampler";
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

export type TerrainLayer = BaseLayer & Terrain;

export const createTerrainLayer = (
  world: World,
  terrain: Partial<Terrain> = {},
) => {
  const { gl } = world;
  let { options, terrainUrl, imageryUrl, color } = {
    options: {},
    terrainUrl: "",
    imageryUrl: "",
    color: [1, 1, 1, 1],
    ...terrain,
  } satisfies Terrain;

  let imageryCache: TileCache | undefined;
  let imageryDownsampler: TileDownsampler | undefined;

  const updateImageryUrl = (imageryUrl: string) => {
    imageryCache?.dispose();
    imageryCache = createTileCache({
      gl,
      urlPattern: imageryUrl,
      onLoad: () => {
        const extension = gl.getExtension("EXT_texture_filter_anisotropic");
        if (extension) {
          const max = gl.getParameter(extension.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
          gl.texParameterf(
            gl.TEXTURE_2D,
            extension.TEXTURE_MAX_ANISOTROPY_EXT,
            max,
          );
        }
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
  };
  updateImageryUrl(imageryUrl);

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

  const { renderProgram, depthProgram } = createPrograms(gl);

  const q = [0, 1, 2, 3];
  const vec3s = q.map(vec3.create);
  const vec4s = q.map(vec4.create);
  const vec2s = q.map(vec2.create);

  const calculateVisibleTiles = (viewport: Viewport) => {
    const { camera, worldToLocal, localToClip, clipToScreen } = viewport;

    const divide: (xyz: vec3) => vec3[] = xyz => {
      const [x = 0, y = 0, z = 0] = xyz;
      const shape = tileShapes.get(xyz);
      let split = insideTileShape(camera, shape);
      if (!split) {
        const clip = shape
          .map((_, i) => worldToLocal(_, vec3s[i]))
          .map((_, i) => localToClip(_, vec4s[i]));
        if (clipped(clip)) return [];
        const size = screenSize(clip.map((_, i) => clipToScreen(_, vec2s[i])));
        split = size > 512 / devicePixelRatio;
      }
      if (split && z < maxZ) {
        const divided: vec3[] = [
          [2 * x, 2 * y, z + 1],
          [2 * x + 1, 2 * y, z + 1],
          [2 * x, 2 * y + 1, z + 1],
          [2 * x + 1, 2 * y + 1, z + 1],
        ];
        return divided.flatMap(_ => divide(_));
      } else return [xyz];
    };

    return divide([0, 0, 0]);
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
    if (configure(gl, depth, options)) return;
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
        index,
      });
    }
  };

  const dispose = () => {
    depthProgram.dispose();
    renderProgram.dispose();
    imageryCache?.dispose();
    terrainCache.dispose();
    elevation.dispose();
    world.remove(layer);
  };

  const layer = {
    render,
    dispose,
    get options() {
      return options;
    },
    set options(_: Partial<LayerOptions>) {
      options = _;
    },
    get terrainUrl() {
      return terrainUrl;
    },
    set terrainUrl(_: string) {
      terrainUrl = _;
    },
    get imageryUrl() {
      return imageryUrl;
    },
    set imageryUrl(_: string) {
      updateImageryUrl(_);
    },
    get color() {
      return color;
    },
    set color(_: vec4) {
      color = _;
    },
  } satisfies TerrainLayer;

  world.add(layer);

  return layer;
};

const createPrograms = (gl: WebGL2RenderingContext) => {
  const createRenderProgram = (depth = false) => {
    const program = createProgram({
      gl,
      vertexSource,
      fragmentSource: depth ? depthSource : fragmentSource,
    });

    const uvwBuffer = createBuffer({ gl, type: "f32", target: "array" });
    uvwBuffer.set(uvw.flatMap(([x = 0, y = 0, z = 0]) => [x, y, z]));

    const indexBuffer = createBuffer({ gl, type: "u16", target: "element" });
    indexBuffer.set(indices);

    const uvwAttribute = program.attribute3f("uvw", uvwBuffer);

    const projectionUniform = program.uniformMatrix4f("projection");
    const modelViewUniform = program.uniformMatrix4f("model_view");
    const imageryUniform = program.uniform1i("imagery");
    const terrainUniform = program.uniform1i("terrain");
    const downsampleImageryUniform = program.uniform1i("downsample_imagery");
    const downsampleTerrainUniform = program.uniform1i("downsample_terrain");
    const colorUniform = program.uniform4f("color");
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

    const dispose = () => {
      uvwBuffer.dispose();
      indexBuffer.dispose();
      program.dispose();
    };

    return { execute, dispose };
  };

  const renderProgram = createRenderProgram();
  const depthProgram = createRenderProgram(true);

  return { renderProgram, depthProgram };
};

const insideTileShape = (position: vec3, shape: vec3[]) => {
  const [minX, maxX, minY, maxY] = shape.reduce(
    ([minX, maxX, minY, maxY], [x = 0, y = 0]) => [
      Math.min(x, minX),
      Math.max(x, maxX),
      Math.min(y, minY),
      Math.max(y, maxY),
    ],
    [1, 0, 1, 0],
  );
  const [x = 0, y = 0, z = 0] = position;
  return (
    x > minX && x < maxX && y > minY && y < maxY && z > 0 && z < maxX - minX
  );
};

const clipped = (clip: vec4[]) =>
  clip.every(([x = 0, , , w = 0]) => x > w) ||
  clip.every(([x = 0, , , w = 0]) => x < -w) ||
  clip.every(([, y = 0, , w = 0]) => y > w) ||
  clip.every(([, y = 0, , w = 0]) => y < -w) ||
  clip.every(([, , z = 0, w = 0]) => z > w) ||
  clip.every(([, , z = 0, w = 0]) => z < -w) ||
  clip.every(([, , , w = 0]) => w < 0);

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
