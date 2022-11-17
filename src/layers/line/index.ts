import { mat4, vec2, vec3, vec4 } from "gl-matrix";
import { Layer } from "../";
import { range } from "../../common";
import { circumference } from "../../constants";
import { Line } from "../../line";
import { mercator } from "../../math";
import { createProgram } from "../../program";
import { Viewport } from "../../viewport";
import fragmentSource from "./fragment.glsl";
import vertexSource from "./vertex.glsl";

const one = 1073741824; // 2^30
const to = ([x, y, z]: vec3) =>
  [Math.floor(x * one), Math.floor(y * one), Math.floor(z * one)] as vec3;

export interface LineLayer extends Layer, Line {
  destroy: () => void;
}

export const createLineLayer: (
  gl: WebGLRenderingContext,
  line: Line
) => LineLayer = (gl, { color, width, minWidthPixels, maxWidthPixels }) => {
  let count = 0;

  let center: vec3 = [0, 0, 0];

  const positionBuffer = gl.createBuffer();
  if (!positionBuffer) throw new Error("Buffer creation failed");

  const indexBuffer = gl.createBuffer();
  if (!indexBuffer) throw new Error("Buffer creation failed");

  const cornerBuffer = gl.createBuffer();
  if (!cornerBuffer) throw new Error("Buffer creation failed");

  const program = createLineProgram(gl, {
    positionBuffer,
    indexBuffer,
    cornerBuffer,
  });

  const render = ({
    projection,
    modelView,
    view: { camera, screen },
  }: Viewport) =>
    program.execute({
      projection,
      modelView,
      camera,
      screen,
      center,
      count,
      color,
      width,
      minWidthPixels,
      maxWidthPixels,
    });

  const depth = () => {
    // TODO:
  };

  const destroy = () => {
    // TODO:
  };

  const updatePoints = (points: vec3[]) => {
    count = points.length;

    const [first] = points;
    const [last] = points.slice(-1);

    if (!first || !last) return;

    center = mercator(first);

    const positionData = [first, ...points, last]
      .map((_) => vec3.sub(vec3.create(), mercator(_), center))
      .flatMap((_) => [..._, ..._, ..._, ..._]);
    const indexData = range(0, count * 2).flatMap((i) => {
      const [a, b, c, d] = range(i * 2, i * 2 + 4);
      return [
        [a, b, c],
        [a, c, d],
      ].flat();
    });
    const cornerData = range(0, count + 1).flatMap(() =>
      [
        [-1, -1],
        [-1, 1],
        [1, 1],
        [1, -1],
      ].flat()
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(positionData),
      gl.DYNAMIC_DRAW
    );

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array(indexData),
      gl.DYNAMIC_DRAW
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(cornerData),
      gl.DYNAMIC_DRAW
    );
  };

  return {
    render,
    depth,
    destroy,
    set points(points: vec3[]) {
      updatePoints(points);
    },
    set color(_color: vec4) {
      color = _color;
    },
    set width(_width: number) {
      width = _width;
    },
    set minWidthPixels(_minWidthPixels: number) {
      minWidthPixels = _minWidthPixels;
    },
    set maxWidthPixels(_maxWidthPixels: number) {
      maxWidthPixels = _maxWidthPixels;
    },
  };
};

const createLineProgram = (
  gl: WebGLRenderingContext,
  {
    positionBuffer,
    indexBuffer,
    cornerBuffer,
  }: {
    positionBuffer: WebGLBuffer;
    indexBuffer: WebGLBuffer;
    cornerBuffer: WebGLBuffer;
  }
) => {
  const program = createProgram({ gl, vertexSource, fragmentSource });

  const previousAttribute = gl.getAttribLocation(program, "previous");
  const currentAttribute = gl.getAttribLocation(program, "current");
  const nextAttribute = gl.getAttribLocation(program, "next");
  const cornerAttribute = gl.getAttribLocation(program, "corner");
  const projectionUniform = gl.getUniformLocation(program, "projection");
  const modelViewUniform = gl.getUniformLocation(program, "modelView");
  const cameraUniform = gl.getUniformLocation(program, "camera");
  const centerUniform = gl.getUniformLocation(program, "center");
  const screenUniform = gl.getUniformLocation(program, "screen");
  const colorUniform = gl.getUniformLocation(program, "color");
  const widthUniform = gl.getUniformLocation(program, "width");
  const maxWidthPixelsUniform = gl.getUniformLocation(
    program,
    "maxWidthPixels"
  );
  const minWidthPixelsUniform = gl.getUniformLocation(
    program,
    "minWidthPixels"
  );

  const execute = ({
    projection,
    modelView,
    camera,
    screen,
    center,
    count,
    color,
    width,
    minWidthPixels,
    maxWidthPixels,
  }: {
    projection: mat4;
    modelView: mat4;
    camera: vec3;
    center: vec3;
    screen: vec2;
    count: number;
    color: vec4;
    width: number;
    minWidthPixels?: number;
    maxWidthPixels?: number;
  }) => {
    if (count == 0) return;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(program);
    gl.uniformMatrix4fv(projectionUniform, false, projection);
    gl.uniformMatrix4fv(modelViewUniform, false, modelView);
    gl.uniform3iv(cameraUniform, [...to(camera)]);
    gl.uniform3iv(centerUniform, [...to(center)]);
    gl.uniform2fv(screenUniform, screen);
    gl.uniform4fv(colorUniform, color);
    gl.uniform1f(widthUniform, width / circumference);
    gl.uniform1f(minWidthPixelsUniform, minWidthPixels || 0);
    gl.uniform1f(maxWidthPixelsUniform, maxWidthPixels || Number.MAX_VALUE);

    const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;

    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
    gl.vertexAttribPointer(
      cornerAttribute,
      2,
      gl.FLOAT,
      false,
      FLOAT_BYTES * 2,
      0
    );
    gl.enableVertexAttribArray(cornerAttribute);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(
      previousAttribute,
      3,
      gl.FLOAT,
      false,
      FLOAT_BYTES * 3,
      0
    );
    gl.enableVertexAttribArray(previousAttribute);

    gl.vertexAttribPointer(
      currentAttribute,
      3,
      gl.FLOAT,
      false,
      FLOAT_BYTES * 3,
      FLOAT_BYTES * 3 * 4
    );
    gl.enableVertexAttribArray(currentAttribute);

    gl.vertexAttribPointer(
      nextAttribute,
      3,
      gl.FLOAT,
      false,
      FLOAT_BYTES * 3,
      FLOAT_BYTES * 3 * 4 * 2
    );
    gl.enableVertexAttribArray(nextAttribute);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.drawElements(gl.TRIANGLES, count * 3 * 4 - 4, gl.UNSIGNED_SHORT, 0);
  };

  const destroy = () => {
    // TODO:
  };

  return { execute, destroy };
};
