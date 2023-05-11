import { mat4, quat, vec2, vec3, vec4 } from "gl-matrix";
import { Layer } from "..";
import { Buffer, createBuffer } from "../../buffer";
import { mercator } from "../../math";
import { Mesh } from "../../mesh";
import { createProgram } from "../../program";
import { Viewport } from "../../viewport";
import fragmentSource from "./fragment.glsl";
import vertexSource from "./vertex.glsl";

const one = 1073741824; // 2^30
const to = ([x, y, z]: vec3) =>
  [Math.floor(x * one), Math.floor(y * one), Math.floor(z * one)] as vec3;

export type MeshLayer = Layer &
  Mesh & {
    destroy: () => void;
  };

export const createMeshLayer: (
  gl: WebGL2RenderingContext,
  mesh: Mesh
) => MeshLayer = (gl, { vertices, indices, position, orientation, color }) => {
  let count = 0;

  const vertexBuffer = createBuffer({ gl, type: "f32", target: "array" });
  const indexBuffer = createBuffer({ gl, type: "u16", target: "element" });

  const program = createMeshProgram(gl, {
    vertexBuffer,
    indexBuffer,
  });

  const render = ({
    projection,
    modelView,
    view: { camera, screen },
  }: Viewport) =>
    program.execute({
      projection,
      modelView,
      camera: to(camera),
      screen, // TODO: Needed?
      count,
      position: to(mercator(position)),
      orientation,
      color,
    });

  const depth = () => {
    // TODO:
  };

  const destroy = () => {
    vertexBuffer.destroy();
    indexBuffer.destroy();
    program.destroy();
  };

  const updateVertices = (vertices: vec3[]) =>
    vertexBuffer.set(vertices.flatMap((_) => [..._]));

  const updateIndices = (indices: vec3[]) => {
    indexBuffer.set(indices.flatMap((_) => [..._]));
    count = indices.length;
  };

  updateVertices(vertices);
  updateIndices(indices);

  return {
    render,
    depth,
    destroy,
    set vertices(vertices: vec3[]) {
      updateVertices(vertices);
    },
    set indices(indices: vec3[]) {
      updateIndices(indices);
    },
    set position(_position: vec3) {
      position = _position;
    },
    set orientation(_orientation: quat) {
      orientation = _orientation;
    },
    set color(_color: vec4) {
      color = _color;
    },
  };
};

const createMeshProgram = (
  gl: WebGL2RenderingContext,
  {
    vertexBuffer,
    indexBuffer,
  }: {
    vertexBuffer: Buffer;
    indexBuffer: Buffer;
  }
) => {
  const program = createProgram({ gl, vertexSource, fragmentSource });

  const vertexAttribute = program.attribute3f("vertex", vertexBuffer);

  const projectionUniform = program.uniformMatrix4f("projection");
  const modelViewUniform = program.uniformMatrix4f("model_view");
  const cameraUniform = program.uniform3i("camera");
  const positionUniform = program.uniform3i("position");
  // const orientationUniform = program.uniform4f("orientation");
  //const screenUniform = program.uniform2f("screen");
  const colorUniform = program.uniform4f("color");

  const execute = ({
    projection,
    modelView,
    camera,
    screen,
    count,
    position,
    orientation,
    color,
  }: {
    projection: mat4;
    modelView: mat4;
    camera: vec3;
    screen: vec2;
    count: number;
    position: vec3;
    orientation: quat;
    color: vec4;
  }) => {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    program.use();

    vertexAttribute.use();

    projectionUniform.set(projection);
    modelViewUniform.set(modelView);
    cameraUniform.set(camera);
    //screenUniform.set(screen);
    positionUniform.set(position);
    //orientationUniform.set(orientation);
    colorUniform.set(color);

    indexBuffer.use();

    gl.drawElements(gl.TRIANGLES, count * 3, gl.UNSIGNED_SHORT, 0);
  };

  const destroy = () => program.destroy();

  return { execute, destroy };
};
