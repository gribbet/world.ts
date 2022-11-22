import { mat4, vec2, vec3, vec4 } from "gl-matrix";
import { Layer } from "..";
import { createBuffer } from "../../buffer";
import { range } from "../../common";
import { imageryUrl, terrainUrl } from "../../constants";
import { createElevation } from "../../elevation";
import { createProgram } from "../../program";
import { createViewport, View, Viewport } from "../../viewport";
import depthSource from "./depth.glsl";
import fragmentSource from "./fragment.glsl";
import { Texture } from "./texture";
import { createTileCache } from "./tile-cache";
import { createTileDownsampler } from "./tile-downsampler";
import { createTileShapes } from "./tile-shapes";
import vertexSource from "./vertex.glsl";

const one = 1073741824; // 2^30
const to = ([x, y, z]: vec3) =>
  [Math.floor(x * one), Math.floor(y * one), Math.floor(z * one)] as vec3;

const n = 34;

const maxZ = 22;

const indices = range(0, n).flatMap((y) =>
  range(0, n).flatMap((x) => [
    y * (n + 1) + x,
    (y + 1) * (n + 1) + x + 1,
    y * (n + 1) + x + 1,
    y * (n + 1) + x,
    (y + 1) * (n + 1) + x,
    (y + 1) * (n + 1) + x + 1,
  ])
);

const skirt = 0.5;
const uvw = range(0, n + 1).flatMap((y) =>
  range(0, n + 1).map((x) => {
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
  })
);

export const createTerrainLayer: (gl: WebGL2RenderingContext) => Layer = (
  gl
) => {
  const imageryCache = createTileCache({
    gl,
    urlPattern: imageryUrl,
    onLoad: () => {
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        gl.LINEAR_MIPMAP_LINEAR
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.generateMipmap(gl.TEXTURE_2D);
    },
  });

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

  const imageryDownsampler = createTileDownsampler(imageryCache);

  const terrainDownsampler = createTileDownsampler(terrainCache);

  const elevation = createElevation({ gl, terrainCache });

  const tileShapes = createTileShapes(elevation);

  const renderProgram = createRenderProgram(gl);

  const depthProgram = createDepthProgram(gl);

  const q = [0, 1, 2, 3];
  const vec3s = q.map(vec3.create);
  const vec4s = q.map(vec4.create);
  const vec2s = q.map(vec2.create);

  const calculateVisibleTiles = (view: View) => {
    const { worldToLocal, localToClip, clipToScreen } = createViewport(view);

    const divide: (xyz: vec3) => vec3[] = (xyz) => {
      const [x, y, z] = xyz;

      const clip = tileShapes
        .get(xyz)
        .map((_, i) => worldToLocal(_, vec3s[i]))
        .map((_, i) => localToClip(_, vec4s[i]));
      if (
        clip.every(([x, , , w]) => x > w) ||
        clip.every(([x, , , w]) => x < -w) ||
        clip.every(([, y, , w]) => y > w) ||
        clip.every(([, y, , w]) => y < -w) ||
        clip.every(([, , z, w]) => z > w) ||
        clip.every(([, , z, w]) => z < -w) ||
        clip.every(([, , , w]) => w < 0)
      )
        return [];

      const pixels = clip.map((_, i) => clipToScreen(_, vec2s[i]));
      const size = Math.sqrt(
        q
          .map((i) =>
            vec2.squaredDistance(pixels[i], pixels[(i + 1) % pixels.length])
          )
          .reduce((a, b) => a + b, 0) / 4
      );

      if (size > 512 && z < maxZ) {
        const divided: vec3[] = [
          [2 * x, 2 * y, z + 1],
          [2 * x + 1, 2 * y, z + 1],
          [2 * x, 2 * y + 1, z + 1],
          [2 * x + 1, 2 * y + 1, z + 1],
        ];

        return divided.flatMap((_) => divide(_));
      } else return [xyz];
    };

    return divide([0, 0, 0]);
  };

  const cancelUnused = (f: () => void) =>
    imageryCache.cancelUnused(() => terrainCache.cancelUnused(f));

  const render = ({ view, projection, modelView }: Viewport) =>
    cancelUnused(() => {
      const { camera } = view;
      const visible = calculateVisibleTiles(view);

      //console.log(visible.length);

      for (const xyz of visible) {
        const downsampledImagery = imageryDownsampler.get(xyz);
        const downsampledTerrain = terrainDownsampler.get(xyz);
        if (!downsampledImagery || !downsampledTerrain) continue;
        const { texture: imagery, downsample: downsampleImagery } =
          downsampledImagery;
        const { texture: terrain, downsample: downsampleTerrain } =
          downsampledTerrain;

        renderProgram.execute({
          projection,
          modelView,
          camera: to(camera),
          xyz,
          imagery,
          terrain,
          downsampleImagery,
          downsampleTerrain,
        });
      }
    });

  const depth = ({ view, projection, modelView }: Viewport) =>
    cancelUnused(() => {
      const { camera } = view;
      const visible = calculateVisibleTiles(view);

      for (const xyz of visible) {
        const downsampledTerrain = terrainDownsampler.get(xyz);
        if (!downsampledTerrain) continue;
        const { texture: terrain, downsample } = downsampledTerrain;

        depthProgram.execute({
          projection,
          modelView,
          camera: to(camera),
          xyz,
          terrain,
          downsample,
        });
      }
    });

  const destroy = () => {
    depthProgram.destroy();
    renderProgram.destroy();
    imageryCache.destroy();
    terrainCache.destroy();
    elevation.destroy();
  };

  return { render, depth, destroy };
};

const createRenderProgram = (gl: WebGL2RenderingContext) => {
  const program = createProgram({
    gl,
    vertexSource,
    fragmentSource,
  });

  const uvwBuffer = createBuffer({ gl, type: "f32", target: "array" });
  uvwBuffer.set(uvw.flatMap(([x, y, z]) => [x, y, z]));

  const indexBuffer = createBuffer({ gl, type: "u16", target: "element" });
  indexBuffer.set(indices);

  const uvwAttribute = program.attribute3f("uvw", uvwBuffer);

  const projectionUniform = program.uniformMatrix4f("projection");
  const modelViewUniform = program.uniformMatrix4f("model_view");
  const imageryUniform = program.uniform1i("imagery");
  const terrainUniform = program.uniform1i("terrain");
  const downsampleImageryUniform = program.uniform1i("downsample_imagery");
  const downsampleTerrainUniform = program.uniform1i("downsample_terrain");
  const xyzUniform = program.uniform3i("xyz");
  const cameraUniform = program.uniform3i("camera");

  const execute = ({
    projection,
    modelView,
    camera,
    xyz,
    imagery,
    terrain,
    downsampleImagery,
    downsampleTerrain,
  }: {
    projection: mat4;
    modelView: mat4;
    camera: vec3;
    xyz: vec3;
    imagery: Texture;
    terrain: Texture;
    downsampleImagery: number;
    downsampleTerrain: number;
  }) => {
    gl.enable(gl.DEPTH_TEST);

    program.use();

    uvwAttribute.use();

    projectionUniform.set(projection);
    modelViewUniform.set(modelView);
    xyzUniform.set(xyz);
    cameraUniform.set(camera);
    downsampleImageryUniform.set(downsampleImagery);
    downsampleTerrainUniform.set(downsampleTerrain);

    gl.activeTexture(gl.TEXTURE0);
    imageryUniform.set(0);
    imagery.use();

    gl.activeTexture(gl.TEXTURE1);
    terrainUniform.set(1);
    terrain.use();

    indexBuffer.use();
    gl.drawElements(gl.TRIANGLES, n * n * 2 * 3, gl.UNSIGNED_SHORT, 0);
  };

  const destroy = () => {
    uvwBuffer.destroy();
    indexBuffer.destroy();
    program.destroy();
  };

  return { execute, destroy };
};

const createDepthProgram = (gl: WebGL2RenderingContext) => {
  const program = createProgram({
    gl,
    vertexSource,
    fragmentSource: depthSource,
  });

  const uvwBuffer = createBuffer({ gl, type: "f32", target: "array" });
  uvwBuffer.set(uvw.flatMap(([x, y, z]) => [x, y, z]));

  const indexBuffer = createBuffer({ gl, type: "u16", target: "element" });
  indexBuffer.set(indices);

  const uvwAttribute = program.attribute3f("uvw", uvwBuffer);

  const projectionUniform = program.uniformMatrix4f("projection");
  const modelViewUniform = program.uniformMatrix4f("model_view");
  const terrainUniform = program.uniform1i("terrain");
  const downsampleTerrainUniform = program.uniform1i("downsample_terrain");
  const xyzUniform = program.uniform3i("xyz");
  const cameraUniform = program.uniform3i("camera");

  const execute = ({
    projection,
    modelView,
    camera,
    xyz,
    terrain,
    downsample,
  }: {
    projection: mat4;
    modelView: mat4;
    camera: vec3;
    xyz: vec3;
    terrain: Texture;
    downsample: number;
  }) => {
    gl.enable(gl.DEPTH_TEST);

    program.use();

    uvwAttribute.use();

    projectionUniform.set(projection);
    modelViewUniform.set(modelView);
    xyzUniform.set(xyz);
    cameraUniform.set(camera);
    downsampleTerrainUniform.set(downsample);

    gl.activeTexture(gl.TEXTURE1);
    terrainUniform.set(1);
    terrain.use();

    indexBuffer.use();
    gl.drawElements(gl.TRIANGLES, n * n * 2 * 3, gl.UNSIGNED_SHORT, 0);
  };

  const destroy = () => {
    uvwBuffer.destroy();
    indexBuffer.destroy();
    program.destroy();
  };

  return { execute, destroy };
};
