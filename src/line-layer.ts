import { mat4, vec3 } from "gl-matrix";
import { range } from "./common";
import vertexSource from "./line-vertex.glsl";
import fragmentSource from "./line-fragment.glsl";
import { createProgram } from "./program";
import { mercator } from "./math";
import { Layer } from "./layer";
import { View } from "./viewport";

const one = 1073741824; // 2^30
const to = ([x, y, z]: vec3) =>
  [Math.floor(x * one), Math.floor(y * one), Math.floor(z * one)] as vec3;

export const createLineLayer: (gl: WebGLRenderingContext) => Layer = (gl) => {
  const n = 10000;
  const points: vec3[] = range(0, n).map<vec3>((i) => [
    -121 + 1 * Math.cos((i / n) * Math.PI * 2),
    38 + 1 * Math.sin((i / n) * Math.PI * 2),
    (i / n) * 1000,
  ]);

  const count = points.length;

  const center = mercator(points[0]);

  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("Buffer creation failed");

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(
      points
        .map(mercator)
        .map((_) => vec3.sub(vec3.create(), _, center))
        .flatMap((_) => [..._])
    ),
    gl.STATIC_DRAW
  );

  const program = createLineProgram(gl, buffer);

  const render = ({ projection, modelView, camera }: View) =>
    program.execute({
      projection,
      modelView,
      camera,
      center,
      count,
    });

  const depth = () => {};

  const destroy = () => {};

  return {
    render,
    depth,
    destroy,
  };
};

const createLineProgram = (gl: WebGLRenderingContext, buffer: WebGLBuffer) => {
  const program = createProgram({ gl, vertexSource, fragmentSource });

  const positionAttribute = gl.getAttribLocation(program, "position");
  const projectionUniform = gl.getUniformLocation(program, "projection");
  const modelViewUniform = gl.getUniformLocation(program, "modelView");
  const cameraUniform = gl.getUniformLocation(program, "camera");
  const centerUniform = gl.getUniformLocation(program, "center");

  const execute = ({
    projection,
    modelView,
    camera,
    center,
    count,
  }: {
    projection: mat4;
    modelView: mat4;
    camera: vec3;
    center: vec3;
    count: number;
  }) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    gl.vertexAttribPointer(positionAttribute, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(positionAttribute);

    gl.useProgram(program);
    gl.uniformMatrix4fv(projectionUniform, false, projection);
    gl.uniformMatrix4fv(modelViewUniform, false, modelView);
    gl.uniform3iv(cameraUniform, [...to(camera)]);
    gl.uniform3iv(centerUniform, [...to(center)]);

    gl.drawArrays(gl.LINE_STRIP, 0, count);
  };

  const destroy = () => {
    // TODO:
  };

  return { execute, destroy };
};
