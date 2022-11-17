import { mat4, vec2, vec3, vec4 } from "gl-matrix";
import { Layer } from "..";
import { range } from "../../common";
import { createProgram } from "../../program";
import { tileShape } from "./tile-shape";
import { createTiles } from "./tiles";
import { View, Viewport, createViewport } from "../../viewport";
import depthSource from "./depth.glsl";
import fragmentSource from "./fragment.glsl";
import vertexSource from "./vertex.glsl";
import { createBuffer } from "../../buffer";
import { Texture } from "./texture";

const one = 1073741824; // 2^30
const to = ([x, y, z]: vec3) =>
  [Math.floor(x * one), Math.floor(y * one), Math.floor(z * one)] as vec3;

const n = 16;

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

const skirt = 0.1;
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
  const tiles = createTiles(gl);

  const renderProgram = createRenderProgram(gl);

  const depthProgram = createDepthProgram(gl);

  const render = ({ view, projection, modelView }: Viewport) =>
    tiles.cancelUnused(() => {
      const { camera } = view;
      const visible = calculateVisibleTiles(view);

      for (const xyz of visible) {
        const { texture: imagery, downsample: downsampleImagery } =
          tiles.imagery(xyz);
        const { texture: terrain, downsample: downsampleTerrain } =
          tiles.terrain(xyz);

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
    tiles.cancelUnused(() => {
      const { camera } = view;
      const visible = calculateVisibleTiles(view);

      for (const xyz of visible) {
        const { texture: terrain, downsample } = tiles.terrain(xyz);

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
    tiles.destroy();
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

  const indicesBuffer = createBuffer({ gl, type: "u16", target: "element" });
  indicesBuffer.set(indices);

  program.attribute("uvw", uvwBuffer);

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

    indicesBuffer.use();
    gl.drawElements(gl.TRIANGLES, n * n * 2 * 3, gl.UNSIGNED_SHORT, 0);
  };

  const destroy = () => {
    uvwBuffer.destroy();
    indicesBuffer.destroy();
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

  const indicesBuffer = createBuffer({ gl, type: "u16", target: "element" });
  indicesBuffer.set(indices);

  program.attribute("uvw", uvwBuffer);

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

    projectionUniform.set(projection);
    modelViewUniform.set(modelView);
    xyzUniform.set(xyz);
    cameraUniform.set(camera);
    downsampleTerrainUniform.set(downsample);

    gl.activeTexture(gl.TEXTURE1);
    terrainUniform.set(1);
    terrain.use();

    indicesBuffer.use();
    gl.drawElements(gl.TRIANGLES, n * n * 2 * 3, gl.UNSIGNED_SHORT, 0);
  };

  const destroy = () => {
    uvwBuffer.destroy();
    indicesBuffer.destroy();
    program.destroy();
  };

  return { execute, destroy };
};

const q = [0, 1, 2, 3];
const vec3s = q.map(vec3.create);
const vec4s = q.map(vec4.create);
const vec2s = q.map(vec2.create);

const calculateVisibleTiles = (view: View) => {
  const { worldToLocal, localToClip, clipToScreen } = createViewport(view);

  const divide: (xyz: vec3) => vec3[] = (xyz) => {
    const [x, y, z] = xyz;

    const clip = tileShape(xyz)
      ?.map((_, i) => worldToLocal(_, vec3s[i]))
      .map((_, i) => localToClip(_, vec4s[i]));
    if (
      !clip ||
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

    if (size > 256 && z < maxZ) {
      const divided: vec3[] = [
        [2 * x, 2 * y, z + 1],
        [2 * x + 1, 2 * y, z + 1],
        [2 * x, 2 * y + 1, z + 1],
        [2 * x + 1, 2 * y + 1, z + 1],
      ];

      const next = divided.flatMap((_) => divide(_));

      if (divided.some((_) => !tileShape(_))) return [xyz];

      return next;
    } else return [xyz];
  };

  return divide([0, 0, 0]);
};
