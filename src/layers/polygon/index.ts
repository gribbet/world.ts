import { earclip } from "earclip";
import type { mat4, vec2, vec4 } from "gl-matrix";
import type { vec3 } from "gl-matrix";

import type { Buffer } from "../../buffer";
import { createBuffer } from "../../buffer";
import { mercator } from "../../math";
import { createProgram } from "../../program";
import type { Viewport } from "../../viewport";
import type { World } from "../../world";
import type { LayerOptions } from "..";
import { type BaseLayer, type Polygon } from "..";
import { configure, to } from "../common";
import depthSource from "../depth.glsl";
import fragmentSource from "./fragment.glsl";
import vertexSource from "./vertex.glsl";

export type PolygonLayer = BaseLayer & Polygon;

export const createPolygonLayer = (
  world: World,
  polygon: Partial<Polygon> = {},
) => {
  const { gl } = world;
  let { options, points, color } = {
    options: {},
    points: [],
    color: [1, 1, 1, 1],
    ...polygon,
  } satisfies Polygon;

  let count = 0;

  const positionBuffer = createBuffer({ gl, type: "i32", target: "array" });
  const indexBuffer = createBuffer({ gl, type: "u16", target: "element" });

  const { renderProgram, depthProgram } = createPrograms(gl, {
    positionBuffer,
    indexBuffer,
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
      index,
    });
  };

  const updatePoints = (_: vec3[][]) => {
    points = _;
    const { vertices, indices } = earclip(
      _.map(_ => _.map(_ => [...to(mercator(_))])),
    );
    positionBuffer.set(vertices);
    indexBuffer.set(indices);
    count = indices.length;
  };

  updatePoints(points);

  const dispose = () => {
    positionBuffer.dispose();
    indexBuffer.dispose();
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
  } satisfies PolygonLayer;

  world.add(layer);

  return layer;
};

const createPrograms = (
  gl: WebGL2RenderingContext,
  {
    positionBuffer,
    indexBuffer,
  }: {
    positionBuffer: Buffer;
    indexBuffer: Buffer;
  },
) => {
  const createRenderProgram = (depth = false) => {
    const program = createProgram({
      gl,
      vertexSource,
      fragmentSource: depth ? depthSource : fragmentSource,
    });

    const positionAttribute = program.attribute3i("position", positionBuffer, {
      stride: 3 * Int32Array.BYTES_PER_ELEMENT,
    });

    const projectionUniform = program.uniformMatrix4f("projection");
    const modelViewUniform = program.uniformMatrix4f("model_view");
    const cameraUniform = program.uniform3i("camera");
    const screenUniform = program.uniform2f("screen");
    const colorUniform = program.uniform4f("color");
    const indexUniform = program.uniform1i("index");

    const execute = ({
      projection,
      modelView,
      camera,
      screen,
      count,
      color,
      index,
    }: {
      projection: mat4;
      modelView: mat4;
      camera: vec3;
      screen: vec2;
      count: number;
      color: vec4;
      index: number;
    }) => {
      if (count === 0) return;

      program.use();

      positionAttribute.use();

      projectionUniform.set(projection);
      modelViewUniform.set(modelView);
      cameraUniform.set(camera);
      screenUniform.set(screen);
      colorUniform.set(color);
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
