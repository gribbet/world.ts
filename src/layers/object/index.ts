import type { vec2, vec3, vec4 } from "gl-matrix";
import { mat4 } from "gl-matrix";

import type { Buffer } from "../../buffer";
import { createBuffer } from "../../buffer";
import type { Context } from "../../context";
import { mercator } from "../../math";
import type { Viewport } from "../../viewport";
import type { Layer, Properties } from "..";
import { cache, createMouseEvents, type Object } from "..";
import { configure, to } from "../common";
import depthSource from "../depth.glsl";
import fragmentSource from "./fragment.glsl";
import vertexSource from "./vertex.glsl";

export const createObjectLayer = (
  context: Context,
  properties: Properties<Partial<Object>> = {},
) => {
  const { gl } = context;
  let count = 0;

  const vertexBuffer = createBuffer({ gl, type: "f32", target: "array" });
  const indexBuffer = createBuffer({ gl, type: "u16", target: "element" });
  const normalBuffer = createBuffer({ gl, type: "f32", target: "array" });

  const { renderProgram, depthProgram } = createPrograms(context, {
    vertexBuffer,
    indexBuffer,
    normalBuffer,
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
    const position = properties.position?.() ?? [0, 0, 0];
    const orientation = properties.orientation?.() ?? [0, 0, 0, 1];
    const color = properties.color?.() ?? [1, 1, 1, 1];
    const diffuse = properties.diffuse?.() ?? [0, 0, 0, 0];
    const size = properties.size?.() ?? 1;
    const minSizePixels = properties.minSizePixels?.() ?? 0;
    const maxSizePixels = properties.maxSizePixels?.() ?? Number.MAX_VALUE;

    updateMesh();

    if (configure(gl, depth, properties)) return;

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
      diffuse,
      size,
      minSizePixels,
      maxSizePixels,
      index,
    });
  };

  const updateMesh = cache(
    () => properties.mesh?.(),
    mesh => {
      const { vertices = [], indices = [], normals = [] } = mesh ?? {};
      vertexBuffer.set(vertices.flatMap(_ => [..._]));
      indexBuffer.set(indices.flatMap(_ => [..._]));
      normalBuffer.set(
        normals.length === 0
          ? vertices.flatMap(() => [0, 0, 0])
          : normals.flatMap(_ => [..._]),
      );
      count = indices.length * 3;
    },
  );

  const dispose = () => {
    vertexBuffer.dispose();
    indexBuffer.dispose();
    normalBuffer.dispose();
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
    normalBuffer,
  }: {
    vertexBuffer: Buffer;
    indexBuffer: Buffer;
    normalBuffer: Buffer;
  },
) => {
  const createRenderProgram = (depth = false) => {
    const program = programs.get({
      vertexSource,
      fragmentSource: depth ? depthSource : fragmentSource,
    });

    const vertexAttribute = program.attribute3f("vertex", vertexBuffer);
    const normalAttribute = program.attribute3f("normal", normalBuffer);

    const projectionUniform = program.uniformMatrix4f("projection");
    const modelViewUniform = program.uniformMatrix4f("model_view");
    const cameraUniform = program.uniform3i("camera");
    const positionUniform = program.uniform3i("position");
    const orientationUniform = program.uniformMatrix4f("orientation");
    const screenUniform = program.uniform2f("screen");
    const colorUniform = program.uniform4f("color");
    const diffuseUniform = program.uniform4f("diffuse");
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
      diffuse,
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
      diffuse: vec4;
      size: number;
      minSizePixels: number;
      maxSizePixels: number;
      index: number;
    }) => {
      program.use();

      vertexAttribute.use();
      normalAttribute.use();

      projectionUniform.set(projection);
      modelViewUniform.set(modelView);
      cameraUniform.set(camera);
      screenUniform.set(screen);
      positionUniform.set(position);
      orientationUniform.set(orientation);
      colorUniform.set(color);
      diffuseUniform.set(diffuse);
      sizeUniform.set(size);
      minSizePixelsUniform.set(minSizePixels);
      maxSizePixelsUniform.set(maxSizePixels);
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
