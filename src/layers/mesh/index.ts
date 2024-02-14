import type { quat, vec2, vec3, vec4 } from "gl-matrix";
import { mat4 } from "gl-matrix";

import type { Buffer } from "../../buffer";
import { createBuffer } from "../../buffer";
import { type Mesh } from "../../layers";
import { mercator } from "../../math";
import { createProgram } from "../../program";
import type { Viewport } from "../../viewport";
import type { World } from "../../world";
import type { BaseLayer, LayerOptions } from "..";
import { configure, to } from "../common";
import depthSource from "../depth.glsl";
import fragmentSource from "./fragment.glsl";
import vertexSource from "./vertex.glsl";

export type MeshLayer = BaseLayer & Mesh;

export const createMeshLayer = (world: World, mesh: Partial<Mesh> = {}) => {
  const { gl } = world;
  let {
    options,
    vertices,
    indices,
    position,
    orientation,
    color,
    size,
    minSizePixels,
    maxSizePixels,
  } = {
    options: {},
    vertices: [],
    indices: [],
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    color: [1, 1, 1, 1],
    size: 1,
    ...mesh,
  } satisfies Mesh;
  let count = 0;

  const vertexBuffer = createBuffer({ gl, type: "f32", target: "array" });
  const indexBuffer = createBuffer({ gl, type: "u16", target: "element" });

  const { renderProgram, depthProgram } = createPrograms(gl, {
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
    if (configure(gl, depth, options)) return;
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);
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
      minSizePixels: minSizePixels || 0,
      maxSizePixels: maxSizePixels || Number.MAX_VALUE,
      index,
    });
    gl.disable(gl.CULL_FACE);
  };

  const updateVertices = (_: vec3[]) => {
    vertices = _;
    vertexBuffer.set(_.flatMap(_ => [..._]));
  };

  const updateIndices = (_: vec3[]) => {
    indices = _;
    indexBuffer.set(_.flatMap(_ => [..._]));
    count = _.length * 3;
  };

  updateVertices(vertices);
  updateIndices(indices);

  const dispose = () => {
    vertexBuffer.dispose();
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
    get vertices() {
      return vertices;
    },
    set vertices(_: vec3[]) {
      updateVertices(_);
    },
    get indices() {
      return indices;
    },
    set indices(_: vec3[]) {
      updateIndices(_);
    },
    get position() {
      return position;
    },
    set position(_: vec3) {
      position = _;
    },
    get orientation() {
      return orientation;
    },
    set orientation(_: quat) {
      orientation = _;
    },
    get color() {
      return color;
    },
    set color(_: vec4) {
      color = _;
    },
    get size() {
      return size;
    },
    set size(_: number) {
      size = _;
    },
    get minSizePixels() {
      return minSizePixels;
    },
    set minSizePixels(_: number | undefined) {
      minSizePixels = _;
    },
    get maxSizePixels() {
      return maxSizePixels;
    },
    set maxSizePixels(_: number | undefined) {
      maxSizePixels = _;
    },
  } satisfies MeshLayer;

  world.add(layer);

  return layer;
};

const createPrograms = (
  gl: WebGL2RenderingContext,
  {
    vertexBuffer,
    indexBuffer,
  }: {
    vertexBuffer: Buffer;
    indexBuffer: Buffer;
  },
) => {
  const createRenderProgram = (depth = false) => {
    const program = createProgram({
      gl,
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
