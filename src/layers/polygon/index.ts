import { earclip } from "earclip";
import type { mat4, vec2, vec4 } from "gl-matrix";
import { vec3 } from "gl-matrix";

import type { Buffer } from "../../buffer";
import { createBuffer } from "../../buffer";
import { mercator } from "../../math";
import { createProgram } from "../../program";
import type { Viewport } from "../../viewport";
import type { LayerOptions } from "..";
import { type BaseLayer, type Polygon } from "..";
import { configure, to } from "../common";
import depthSource from "../depth.glsl";
import fragmentSource from "./fragment.glsl";
import vertexSource from "./vertex.glsl";

export type PolygonLayer = BaseLayer & Polygon;

export const createPolygonLayer = (
  gl: WebGL2RenderingContext,
  polygon: Partial<Polygon>,
) => {
  let { options, points, color } = {
    options: {},
    points: [],
    color: [1, 1, 1, 1],
    ...polygon,
  } satisfies Polygon;

  let count = 0;

  const center: vec3 = [0, 0, 0];

  const positionBuffer = createBuffer({ gl, type: "f32", target: "array" });
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
      center: to(center),
      screen,
      count,
      color,
      index,
    });
  };

  const destroy = () => {
    positionBuffer.destroy();
    indexBuffer.destroy();
    renderProgram.destroy();
    depthProgram.destroy();
  };

  const updatePoints = (_: vec3[][]) => {
    points = _;
    const { vertices, indices } = earclip(
      _.map(_ => {
        const [first] = _;
        if (!first) return [];
        return [..._, first].map(_ => [
          ...vec3.sub(vec3.create(), mercator(_), center),
        ]);
      }),
    );
    positionBuffer.set(vertices);
    indexBuffer.set(indices);
    count = indices.length;
  };

  updatePoints(points);

  return {
    render,
    destroy,
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

    const positionAttribute = program.attribute3f("position", positionBuffer, {
      stride: 3 * Float32Array.BYTES_PER_ELEMENT,
    });

    const projectionUniform = program.uniformMatrix4f("projection");
    const modelViewUniform = program.uniformMatrix4f("model_view");
    const cameraUniform = program.uniform3i("camera");
    const centerUniform = program.uniform3i("center");
    const screenUniform = program.uniform2f("screen");
    const colorUniform = program.uniform4f("color");
    const indexUniform = program.uniform1i("index");

    const execute = ({
      projection,
      modelView,
      camera,
      center,
      screen,
      count,
      color,
      index,
    }: {
      projection: mat4;
      modelView: mat4;
      camera: vec3;
      center: vec3;
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
      centerUniform.set(center);
      screenUniform.set(screen);
      colorUniform.set(color);
      indexUniform.set(index);

      indexBuffer.use();

      gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
    };

    const destroy = () => program.destroy();

    return { execute, destroy };
  };

  const renderProgram = createRenderProgram();
  const depthProgram = createRenderProgram(true);

  return { renderProgram, depthProgram };
};