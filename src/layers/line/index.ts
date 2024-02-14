import type { mat4, vec2, vec4 } from "gl-matrix";
import type { vec3 } from "gl-matrix";

import type { Buffer } from "../../buffer";
import { createBuffer } from "../../buffer";
import { range } from "../../common";
import { mercator } from "../../math";
import { createProgram } from "../../program";
import type { Viewport } from "../../viewport";
import type { World } from "../../world";
import type { LayerOptions } from "../";
import { type BaseLayer, type Line } from "../";
import { configure, to } from "../common";
import depthSource from "../depth.glsl";
import fragmentSource from "./fragment.glsl";
import vertexSource from "./vertex.glsl";

export type LineLayer = BaseLayer & Line;

export const createLineLayer = (world: World, line: Partial<Line> = {}) => {
  const { gl } = world;
  let { options, points, color, width, minWidthPixels, maxWidthPixels } = {
    options: {},
    points: [],
    color: [1, 1, 1, 1],
    width: 1,
    ...line,
  } satisfies Line;

  let count = 0;

  const positionBuffer = createBuffer({ gl, type: "i32", target: "array" });
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
  }) => {
    if (configure(gl, depth, options)) return;
    const program = depth ? depthProgram : renderProgram;
    program.execute({
      projection,
      modelView,
      camera: to(camera),
      screen,
      count,
      color,
      width,
      minWidthPixels: minWidthPixels || 0,
      maxWidthPixels: maxWidthPixels || Number.MAX_VALUE,
      index,
    });
  };

  const updatePoints = (_: vec3[][]) => {
    points = _;

    const positionData = _.flatMap(_ => {
      const [first] = _;
      const [last] = _.slice(-1);

      if (!first || !last) return [];

      return [first, ..._, last]
        .map(_ => to(mercator(_)))
        .flatMap(_ => [..._, ..._, ..._, ..._]);
    });

    const { indexData } = _.reduce<{
      indexData: number[];
      count: number;
    }>(
      ({ indexData, count }, _) => {
        if (_.length === 0) return { indexData, count };
        const indices = range(0, (_.length - 1) * 2).flatMap(i => {
          const [a = 0, b = 0, c = 0, d = 0] = range(0, 4).map(
            _ => _ + i * 2 + count,
          );
          return [
            [a, b, d],
            [a, d, c],
          ].flat();
        });
        count += (_.length + 2) * 4;
        indexData = indexData.concat(indices);
        return { indexData, count };
      },
      { indexData: [], count: 0 },
    );
    count = indexData.length;

    const cornerData = _.flatMap(_ =>
      _.length === 0
        ? []
        : range(0, (_.length + 1) * 2).flatMap(() =>
            [
              [-1, -1],
              [-1, 1],
              [1, -1],
              [1, 1],
            ].flat(),
          ),
    );

    positionBuffer.set(positionData);
    indexBuffer.set(indexData);
    cornerBuffer.set(cornerData);
  };

  updatePoints(points);

  const dispose = () => {
    positionBuffer.dispose();
    indexBuffer.dispose();
    cornerBuffer.dispose();
    renderProgram.dispose();
    depthProgram.dispose();
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
    get points() {
      return points;
    },
    set points(_: vec3[][]) {
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

  world.add(layer);

  return layer;
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
    const INT_BYTES = Int32Array.BYTES_PER_ELEMENT;

    const previousAttribute = program.attribute3i("previous", positionBuffer, {
      stride: INT_BYTES * 3,
    });
    const currentAttribute = program.attribute3i("current", positionBuffer, {
      stride: INT_BYTES * 3,
      offset: INT_BYTES * 3 * 4,
    });
    const nextAttribute = program.attribute3i("next", positionBuffer, {
      stride: INT_BYTES * 3,
      offset: INT_BYTES * 3 * 4 * 2,
    });
    const cornerAttribute = program.attribute2f("corner", cornerBuffer, {
      stride: FLOAT_BYTES * 2,
    });

    const projectionUniform = program.uniformMatrix4f("projection");
    const modelViewUniform = program.uniformMatrix4f("model_view");
    const cameraUniform = program.uniform3i("camera");
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
      screen: vec2;
      count: number;
      color: vec4;
      width: number;
      minWidthPixels: number;
      maxWidthPixels: number;
      index: number;
    }) => {
      if (count === 0) return;

      program.use();

      previousAttribute.use();
      currentAttribute.use();
      nextAttribute.use();
      cornerAttribute.use();

      projectionUniform.set(projection);
      modelViewUniform.set(modelView);
      cameraUniform.set(camera);
      screenUniform.set(screen);
      colorUniform.set(color);
      widthUniform.set(width);
      minWidthPixelsUniform.set(minWidthPixels);
      maxWidthPixelsUniform.set(maxWidthPixels);
      indexUniform.set(index);

      indexBuffer.use();

      gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
    };

    const { dispose } = program;

    return { execute, dispose };
  };

  const renderProgram = createRenderProgram();
  const depthProgram = createRenderProgram(true);

  return { renderProgram, depthProgram };
};
