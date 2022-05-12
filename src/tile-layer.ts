import { mat4, vec2, vec3, vec4 } from "gl-matrix";
import { range } from "./common";
import depthSource from "./depth.glsl";
import { Layer } from "./layer";
import { createProgram } from "./program";
import renderSource from "./render.glsl";
import { tileShape } from "./tile-shape";
import { createTiles } from "./tiles";
import vertexSource from "./vertex.glsl";
import { View, viewport } from "./viewport";

const one = 1073741824; // 2^30
const to = ([x, y, z]: vec3) =>
  [Math.floor(x * one), Math.floor(y * one), Math.floor(z * one)] as vec3;

const n = 32;

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
  range(0, n + 1).flatMap((x) => {
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

    return [u, v, w];
  })
);

export const createTileLayer = (gl: WebGLRenderingContext) => {
  const tiles = createTiles(gl);

  const uvwBuffer = gl.createBuffer();
  if (!uvwBuffer) throw new Error("Buffer creation failed");
  gl.bindBuffer(gl.ARRAY_BUFFER, uvwBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvw), gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  if (!indexBuffer) throw new Error("Buffer creation failed");
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indices),
    gl.STATIC_DRAW
  );

  const renderProgram = createRenderProgram({
    gl,
    uvwBuffer,
    indexBuffer,
  });

  const depthProgram = createDepthProgram({
    gl,
    uvwBuffer,
    indexBuffer,
  });

  const render = (view: View) =>
    tiles.cancelUnused(() => {
      const { projection, modelView, camera } = view;
      const visible = calculateVisibleTiles(view);

      for (const xyz of visible) {
        const { texture: imagery, downsample: downsampleImagery } =
          tiles.imagery(xyz);
        const { texture: terrain, downsample: downsampleTerrain } =
          tiles.terrain(xyz);

        renderProgram.execute({
          projection,
          modelView,
          camera,
          xyz,
          imagery,
          terrain,
          downsampleImagery,
          downsampleTerrain,
        });
      }
    });

  const depth = (view: View) =>
    tiles.cancelUnused(() => {
      const { projection, modelView, camera } = view;
      const visible = calculateVisibleTiles(view);

      for (const xyz of visible) {
        const { texture: terrain, downsample } = tiles.terrain(xyz);

        depthProgram.execute({
          projection,
          modelView,
          camera,
          xyz,
          terrain,
          downsample,
        });
      }
    });

  const destroy = () => {
    depthProgram.destroy();
    renderProgram.destroy();
    gl.deleteBuffer(indexBuffer);
    gl.deleteBuffer(uvwBuffer);
  };

  return { render, depth, destroy };
};

const createRenderProgram = ({
  gl,
  uvwBuffer,
  indexBuffer,
}: {
  gl: WebGLRenderingContext;
  uvwBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
}) => {
  const program = createProgram({
    gl,
    vertexSource,
    fragmentSource: renderSource,
  });

  const uvwAttribute = gl.getAttribLocation(program, "uvw");
  const projectionUniform = gl.getUniformLocation(program, "projection");
  const modelViewUniform = gl.getUniformLocation(program, "modelView");
  const imageryUniform = gl.getUniformLocation(program, "imagery");
  const terrainUniform = gl.getUniformLocation(program, "terrain");
  const downsampleImageryUniform = gl.getUniformLocation(
    program,
    "downsampleImagery"
  );
  const downsampleTerrainUniform = gl.getUniformLocation(
    program,
    "downsampleTerrain"
  );
  const xyzUniform = gl.getUniformLocation(program, "xyz");
  const cameraUniform = gl.getUniformLocation(program, "camera");

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
    imagery: WebGLTexture;
    terrain: WebGLTexture;
    downsampleImagery: number;
    downsampleTerrain: number;
  }) => {
    gl.enable(gl.DEPTH_TEST);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, uvwBuffer);
    gl.vertexAttribPointer(uvwAttribute, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(uvwAttribute);

    gl.useProgram(program);
    gl.uniform1i(imageryUniform, 0);
    gl.uniform1i(terrainUniform, 1);
    gl.uniformMatrix4fv(projectionUniform, false, projection);
    gl.uniformMatrix4fv(modelViewUniform, false, modelView);
    gl.uniform3iv(cameraUniform, [...to(camera)]);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, imagery);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, terrain);
    gl.uniform1i(downsampleImageryUniform, downsampleImagery);
    gl.uniform1i(downsampleTerrainUniform, downsampleTerrain);
    gl.uniform3iv(xyzUniform, [...xyz]);

    gl.drawElements(gl.TRIANGLES, n * n * 2 * 3, gl.UNSIGNED_SHORT, 0);
  };

  const destroy = () => {
    // TODO:
  };

  return { execute, destroy };
};

const createDepthProgram = ({
  gl,
  uvwBuffer,
  indexBuffer,
}: {
  gl: WebGLRenderingContext;
  uvwBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
}) => {
  const program = createProgram({
    gl,
    vertexSource,
    fragmentSource: depthSource,
  });

  const uvwAttribute = gl.getAttribLocation(program, "uvw");
  const projectionUniform = gl.getUniformLocation(program, "projection");
  const modelViewUniform = gl.getUniformLocation(program, "modelView");
  const terrainUniform = gl.getUniformLocation(program, "terrain");
  const downsampleTerrainUniform = gl.getUniformLocation(
    program,
    "downsampleTerrain"
  );
  const xyzUniform = gl.getUniformLocation(program, "xyz");
  const cameraUniform = gl.getUniformLocation(program, "camera");

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
    terrain: WebGLTexture;
    downsample: number;
  }) => {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, uvwBuffer);
    gl.vertexAttribPointer(uvwAttribute, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(uvwAttribute);

    gl.useProgram(program);
    gl.uniform1i(terrainUniform, 0);
    gl.uniformMatrix4fv(projectionUniform, false, projection);
    gl.uniformMatrix4fv(modelViewUniform, false, modelView);
    gl.uniform3iv(cameraUniform, [...to(camera)]);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, terrain);
    gl.uniform1i(downsampleTerrainUniform, downsample);
    gl.uniform3iv(xyzUniform, [...xyz]);

    gl.drawElements(gl.TRIANGLES, n * n * 2 * 3, gl.UNSIGNED_SHORT, 0);
  };

  const destroy = () => {
    // TODO:
  };

  return { execute, destroy };
};

const q = [0, 1, 2, 3];
const vec3s = q.map(vec3.create);
const vec4s = q.map(vec4.create);
const vec2s = q.map(vec2.create);

const calculateVisibleTiles = (view: View) => {
  const { width, height } = view;
  const { worldToLocal, localToClip, clipToScreen } = viewport(view);

  const divide: (xyz: vec3, size: vec2) => vec3[] = (xyz, [width, height]) => {
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
    if (size > 256 * 2 && z < maxZ) {
      const divided: vec3[] = [
        [2 * x, 2 * y, z + 1],
        [2 * x + 1, 2 * y, z + 1],
        [2 * x, 2 * y + 1, z + 1],
        [2 * x + 1, 2 * y + 1, z + 1],
      ];

      const next = divided.flatMap((_) => divide(_, [width, height]));

      if (divided.some((_) => !tileShape(_))) return [xyz];

      return next;
    } else return [xyz];
  };

  return divide([0, 0, 0], [width, height]);
};
