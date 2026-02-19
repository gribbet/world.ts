import earcut, { flatten } from "earcut";
import type { mat4, vec2, vec3, vec4 } from "gl-matrix";

import type { Buffer } from "../../buffer";
import { createBuffer } from "../../buffer";
import type { Context } from "../../context";
import { mercator } from "../../math";
import type { Viewport } from "../../viewport";
import type { Layer, Polygon, Properties } from "..";
import { cache, createMouseEvents, resolve } from "..";
import { configure, to } from "../common";
import depthSource from "../depth.glsl";
import fragmentSource from "./fragment.glsl";
import vertexSource from "./vertex.glsl";

export const createPolygonLayer = (
  context: Context,
  properties: Properties<Partial<Polygon>> = {},
) => {
  const { gl } = context;
  let count = 0;

  const positionBuffer = createBuffer({ gl, type: "i32", target: "array" });
  const indexBuffer = createBuffer({ gl, type: "u16", target: "element" });

  const { renderProgram, depthProgram } = createPrograms(context, {
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
    const color = resolve(properties.color) ?? [1, 1, 1, 1];

    resolve(updatePoints);

    if (configure(gl, depth, properties)) return;

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

  const updatePoints = cache(properties.points, (_ = []) => {
    const { vertices, indices } = triangulate(
      _.map(_ =>
        _.map(_ => _.map(_ => to(mercator(_)))).filter(_ => _.length > 0),
      ).filter(_ => _.length > 0),
    );
    positionBuffer.set(vertices);
    indexBuffer.set(indices);
    count = indices.length;
  });

  const dispose = () => {
    positionBuffer.dispose();
    indexBuffer.dispose();
  };

  const mouseEvents = createMouseEvents(properties);

  return {
    render,
    dispose,
    ...mouseEvents,
  } satisfies Layer;
};

const createPrograms = (
  { gl, programs }: Context,
  {
    positionBuffer,
    indexBuffer,
  }: {
    positionBuffer: Buffer<"i32">;
    indexBuffer: Buffer<"u16">;
  },
) => {
  const createRenderProgram = (depth = false) => {
    const program = programs.get({
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

    return { execute };
  };

  const renderProgram = createRenderProgram();
  const depthProgram = createRenderProgram(true);

  return { renderProgram, depthProgram };
};

const triangulate = (coordinates: vec3[][][]) => {
  const [vertices, indices] = coordinates.reduce<[number[], number[], number]>(
    ([vertices, indices, offset], polygon) => {
      const a = flatten(polygon);
      vertices.push(...a.vertices);
      indices.push(
        ...earcut(a.vertices, a.holes, a.dimensions).map(_ => _ + offset),
      );
      offset += a.vertices.length / a.dimensions;
      return [vertices, indices, offset];
    },
    [[], [], 0],
  );

  return { vertices, indices };
};
