import type { vec2, vec3, vec4 } from "gl-matrix";
import { mat4 } from "gl-matrix";

import type { Buffer } from "../../buffer";
import { createBuffer } from "../../buffer";
import { Context } from "../../context";
import type { Layer, Properties } from "../../layers";
import { cache, createMouseEvents, resolve, type Mesh } from "../../layers";
import { mercator } from "../../math";
import type { Viewport } from "../../viewport";
import { configure, to } from "../common";
import depthSource from "../depth.glsl";
import fragmentSource from "./fragment.glsl";
import vertexSource from "./vertex.glsl";

export const createMeshLayer = (
  context: Context,
  properties: Properties<Partial<Mesh>> = {}
) => {
  const { gl } = context;
  let count = 0;

  const vertexBuffer = createBuffer({ gl, type: "f32", target: "array" });
  const indexBuffer = createBuffer({ gl, type: "u16", target: "element" });

  const { renderProgram, depthProgram } = createPrograms(context, {
    vertexBuffer,
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
    const {
      position = [0, 0, 0],
      orientation = [0, 0, 0, 1],
      color = [1, 1, 1, 1],
      size = 1,
      minSizePixels = 0,
      maxSizePixels = Number.MAX_VALUE,
      ...options
    } = resolve(properties);

    updateVertices();
    updateIndices();

    if (configure(gl, depth, options)) return;

    const program = depth ? depthProgram : renderProgram;
    program.execute({
      projection,
      modelView,
      camera: to(camera),
      screen,
      count,
      position: to(mercator(position)),
      orientation: mat4.fromQuat(mat4.create(), orientation),
      color,
      size,
      minSizePixels,
      maxSizePixels,
      index,
    });
  };

  const updateVertices = cache(
    () => properties.vertices?.() ?? [],
    _ => vertexBuffer.set(_.flatMap(_ => [..._]))
  );

  const updateIndices = cache(
    () => properties.indices?.() ?? [],
    _ => {
      indexBuffer.set(_.flatMap(_ => [..._]));
      count = _.length * 3;
    }
  );

  const dispose = () => {
    vertexBuffer.dispose();
    indexBuffer.dispose();
    renderProgram.dispose();
    depthProgram.dispose();
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
    vertexBuffer,
    indexBuffer,
  }: {
    vertexBuffer: Buffer;
    indexBuffer: Buffer;
  }
) => {
  const createRenderProgram = (depth = false) => {
    const program = programs.get({
      vertexSource,
      fragmentSource: depth ? depthSource : fragmentSource,
    });

    const vertexAttribute = program.attribute3f("vertex", vertexBuffer);

    const projectionUniform = program.uniformMatrix4f("projection");
    const modelViewUniform = program.uniformMatrix4f("model_view");
    const cameraUniform = program.uniform3i("camera");
    const positionUniform = program.uniform3i("position");
    const orientationUniform = program.uniformMatrix4f("orientation");
    const screenUniform = program.uniform2f("screen");
    const colorUniform = program.uniform4f("color");
    const sizeUniform = program.uniform1f("size");
    const minSizePixelsUniform = program.uniform1f("min_size_pixels");
    const maxSizePixelsUniform = program.uniform1f("max_size_pixels");
    const indexUniform = program.uniform1i("index");

    const execute = ({
      projection,
      modelView,
      camera,
      screen,
      count,
      position,
      orientation,
      color,
      size,
      minSizePixels,
      maxSizePixels,
      index,
    }: {
      projection: mat4;
      modelView: mat4;
      camera: vec3;
      screen: vec2;
      count: number;
      position: vec3;
      orientation: mat4;
      color: vec4;
      size: number;
      minSizePixels: number;
      maxSizePixels: number;
      index: number;
    }) => {
      program.use();

      vertexAttribute.use();

      projectionUniform.set(projection);
      modelViewUniform.set(modelView);
      cameraUniform.set(camera);
      screenUniform.set(screen);
      positionUniform.set(position);
      orientationUniform.set(orientation);
      colorUniform.set(color);
      sizeUniform.set(size);
      minSizePixelsUniform.set(minSizePixels);
      maxSizePixelsUniform.set(maxSizePixels);
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
