import { mat4, quat, vec2, vec3, vec4 } from "gl-matrix";
import { BaseLayer, LayerEvents } from "..";
import { Buffer, createBuffer } from "../../buffer";
import { mercator } from "../../math";
import { createProgram } from "../../program";
import { Viewport } from "../../viewport";
import fragmentSource from "./fragment.glsl";
import depthSource from "../depth.glsl";
import vertexSource from "./vertex.glsl";
import { circumference } from "../../constants";
import { to } from "../utils";
import { Mesh } from "../../layers";

export type MeshLayer = BaseLayer & Mesh;

export const createMeshLayer: (
  gl: WebGL2RenderingContext,
  mesh: Mesh & LayerEvents
) => MeshLayer = (gl, mesh) => {
  let {
    vertices,
    indices,
    position,
    orientation,
    color,
    size,
    minSizePixels,
    maxSizePixels,
  } = mesh;
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
  }) =>
    (depth ? depthProgram : renderProgram).execute({
      projection,
      modelView,
      camera: to(camera),
      screen,
      count,
      position: to(mercator(position)),
      orientation: mat4.fromQuat(mat4.create(), orientation),
      color,
      size: size / circumference,
      minSizePixels: minSizePixels || 0,
      maxSizePixels: maxSizePixels || Number.MAX_VALUE,
      index,
    });

  const destroy = () => {
    vertexBuffer.destroy();
    indexBuffer.destroy();
    renderProgram.destroy();
    depthProgram.destroy();
  };

  const updateVertices = (_: vec3[]) => {
    vertices = _;
    vertexBuffer.set(_.flatMap((_) => [..._]));
  };

  const updateIndices = (_: vec3[]) => {
    indices = _;
    indexBuffer.set(_.flatMap((_) => [..._]));
    count = _.length;
  };

  updateVertices(vertices);
  updateIndices(indices);

  return {
    render,
    destroy,
    ...mesh,
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
  };
};

const createPrograms = (
  gl: WebGL2RenderingContext,
  {
    vertexBuffer,
    indexBuffer,
  }: {
    vertexBuffer: Buffer;
    indexBuffer: Buffer;
  }
) => {
  const [renderProgram, depthProgram] = [false, true].map((depth) => {
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
      gl.enable(gl.DEPTH_TEST);
      if (!depth) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      }

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

      gl.drawElements(gl.TRIANGLES, count * 3, gl.UNSIGNED_SHORT, 0);
    };

    const destroy = () => program.destroy();

    return { execute, destroy };
  });

  return { renderProgram, depthProgram };
};
