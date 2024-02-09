import type { mat4, vec2, vec4 } from "gl-matrix";
import { vec3 } from "gl-matrix";

import type { Buffer } from "../../buffer";
import { createBuffer } from "../../buffer";
import { range } from "../../common";
import { circumference } from "../../constants";
import { mercator } from "../../math";
import { createProgram } from "../../program";
import type { Viewport } from "../../viewport";
import type { BaseLayer, Line } from "../";
import depthSource from "../depth.glsl";
import { to } from "../utils";
import fragmentSource from "./fragment.glsl";
import vertexSource from "./vertex.glsl";

export type LineLayer = BaseLayer & Line;

export const createLineLayer = (
  gl: WebGL2RenderingContext,
  line: Partial<Line>,
) => {
  let { points, color, width, minWidthPixels, maxWidthPixels } = {
    points: [],
    color: [1, 1, 1, 1],
    width: 1,
    ...line,
  } satisfies Line;

  let count = 0;

  let center: vec3 = [0, 0, 0];

  const positionBuffer = createBuffer({ gl, type: "f32", target: "array" });
  const indexBuffer = createBuffer({ gl, type: "u16", target: "element" });
  const cornerBuffer = createBuffer({ gl, type: "f32", target: "array" });

  const { renderProgram, depthProgram } = createPrograms(gl, {
    positionBuffer,
    indexBuffer,
    cornerBuffer,
  });

  const render = ({
    viewport: { projection, modelView, camera, screen },
    depth = false,
    index = 0,
  }: {
    viewport: Viewport;
    depth?: boolean;
    index?: number;
  }) =>
    (depth ? depthProgram : renderProgram).execute({
      projection,
      modelView,
      camera: to(camera),
      center: to(center),
      screen,
      count,
      color,
      width: width / circumference,
      minWidthPixels: minWidthPixels || 0,
      maxWidthPixels: maxWidthPixels || Number.MAX_VALUE,
      index,
    });

  const destroy = () => {
    positionBuffer.destroy();
    indexBuffer.destroy();
    cornerBuffer.destroy();
    renderProgram.destroy();
    depthProgram.destroy();
  };

  const updatePoints = (_: vec3[]) => {
    points = _;
    count = _.length;

    const [first] = _;
    const [last] = _.slice(-1);

    if (!first || !last) return;

    center = mercator(first);

    const positionData = [first, ..._, last]
      .map(_ => vec3.sub(vec3.create(), mercator(_), center))
      .flatMap(_ => [..._, ..._, ..._, ..._]);
    const indexData = range(0, count * 2).flatMap(i => {
      const [a = 0, b = 0, c = 0, d = 0] = range(i * 2, i * 2 + 4);
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
      ].flat(),
    );

    positionBuffer.set(positionData);
    indexBuffer.set(indexData);
    cornerBuffer.set(cornerData);
  };

  updatePoints(points);

  return {
    render,
    destroy,
    get points() {
      return points;
    },
    set points(_: vec3[]) {
      updatePoints(_);
    },
    get color() {
      return color;
    },
    set color(_: vec4) {
      color = _;
    },
    get width() {
      return width;
    },
    set width(_: number) {
      width = _;
    },
    get minWidthPixels() {
      return minWidthPixels;
    },
    set minWidthPixels(_: number | undefined) {
      minWidthPixels = _;
    },
    get maxWidthPixels() {
      return maxWidthPixels;
    },
    set maxWidthPixels(_: number | undefined) {
      maxWidthPixels = _;
    },
  } satisfies LineLayer;
};

const createPrograms = (
  gl: WebGL2RenderingContext,
  {
    positionBuffer,
    indexBuffer,
    cornerBuffer,
  }: {
    positionBuffer: Buffer;
    indexBuffer: Buffer;
    cornerBuffer: Buffer;
  },
) => {
  const createRenderProgram = (depth = false) => {
    const program = createProgram({
      gl,
      vertexSource,
      fragmentSource: depth ? depthSource : fragmentSource,
    });

    const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;

    const previousAttribute = program.attribute3f("previous", positionBuffer, {
      stride: 3 * FLOAT_BYTES,
    });
    const currentAttribute = program.attribute3f("current", positionBuffer, {
      stride: 3 * FLOAT_BYTES,
      offset: FLOAT_BYTES * 3 * 4,
    });
    const nextAttribute = program.attribute3f("next", positionBuffer, {
      stride: 3 * FLOAT_BYTES,
      offset: FLOAT_BYTES * 3 * 4 * 2,
    });
    const cornerAttribute = program.attribute2f("corner", cornerBuffer, {
      stride: FLOAT_BYTES * 2,
    });

    const projectionUniform = program.uniformMatrix4f("projection");
    const modelViewUniform = program.uniformMatrix4f("model_view");
    const cameraUniform = program.uniform3i("camera");
    const centerUniform = program.uniform3i("center");
    const screenUniform = program.uniform2f("screen");
    const colorUniform = program.uniform4f("color");
    const widthUniform = program.uniform1f("width");
    const maxWidthPixelsUniform = program.uniform1f("max_width_pixels");
    const minWidthPixelsUniform = program.uniform1f("min_width_pixels");
    const indexUniform = program.uniform1i("index");

    const execute = ({
      projection,
      modelView,
      camera,
      center,
      screen,
      count,
      color,
      width,
      minWidthPixels,
      maxWidthPixels,
      index,
    }: {
      projection: mat4;
      modelView: mat4;
      camera: vec3;
      center: vec3;
      screen: vec2;
      count: number;
      color: vec4;
      width: number;
      minWidthPixels: number;
      maxWidthPixels: number;
      index: number;
    }) => {
      if (count === 0) return;

      gl.enable(gl.DEPTH_TEST);
      if (depth) gl.disable(gl.BLEND);
      else {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      }

      program.use();

      previousAttribute.use();
      currentAttribute.use();
      nextAttribute.use();
      cornerAttribute.use();

      projectionUniform.set(projection);
      modelViewUniform.set(modelView);
      cameraUniform.set(camera);
      centerUniform.set(center);
      screenUniform.set(screen);
      colorUniform.set(color);
      widthUniform.set(width);
      minWidthPixelsUniform.set(minWidthPixels);
      maxWidthPixelsUniform.set(maxWidthPixels);
      indexUniform.set(index);

      indexBuffer.use();

      gl.drawElements(gl.TRIANGLES, count * 3 * 4 - 4, gl.UNSIGNED_SHORT, 0);
    };

    const destroy = () => program.destroy();

    return { execute, destroy };
  };

  const renderProgram = createRenderProgram();
  const depthProgram = createRenderProgram(true);

  return { renderProgram, depthProgram };
};
