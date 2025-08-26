import type { quat, vec2, vec3, vec4 } from "gl-matrix";
import { mat4 } from "gl-matrix";

import type { Buffer } from "../../buffer";
import { createBuffer } from "../../buffer";
import type { Context } from "../../context";
import { mercator } from "../../math";
import type { Viewport } from "../../viewport";
import type { Layer, Object as Object_, Properties } from "..";
import { cache, createMouseEvents } from "..";
import { configure, to } from "../common";
import { createImageTexture } from "../terrain/image-texture";
import depthSource from "../depth.glsl";
import fragmentSource from "./fragment.glsl";
import vertexSource from "./vertex.glsl";
import { Texture } from "../terrain/texture";

export const createObjectLayer = (
  context: Context,
  properties: Properties<Partial<Object_>> = {},
) => {
  const { gl } = context;

  let count = 0;
  let texture: Texture | undefined;

  const vertexBuffer = createBuffer({ gl, type: "f32", target: "array" });
  const indexBuffer = createBuffer({ gl, type: "u32", target: "element" });
  const normalBuffer = createBuffer({ gl, type: "f32", target: "array" });
  const uvBuffer = createBuffer({ gl, type: "f32", target: "array" });

  const { renderProgram, depthProgram } = createPrograms(context, {
    vertexBuffer,
    indexBuffer,
    normalBuffer,
    uvBuffer,
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
    updateTextureUrl();

    if (configure(gl, depth, properties)) return;

    const fixOrientation = ([x = 0, y = 0, z = 0, w = 0]: quat) =>
      [-x, y, z, w] satisfies quat;

    const program = depth ? depthProgram : renderProgram;
    program.execute({
      projection,
      modelView,
      camera: to(camera),
      screen,
      count,
      position: to(mercator(position)),
      orientation: mat4.fromQuat(mat4.create(), fixOrientation(orientation)),
      color,
      diffuse,
      size,
      minSizePixels,
      maxSizePixels,
      index,
      texture,
    });
  };

  const updateMesh = cache(
    () => properties.mesh?.(),
    mesh => {
      const {
        vertices = [],
        indices = [],
        normals = [],
        uvs = [],
      } = mesh ?? {};
      vertexBuffer.set(vertices.flatMap(_ => [..._]));
      indexBuffer.set(indices.flatMap(_ => [..._]));
      normalBuffer.set(
        normals.length === 0
          ? vertices.flatMap(() => [0, 0, 0])
          : normals.flatMap(_ => [..._]),
      );
      uvBuffer.set(
        uvs.length === 0
          ? vertices.flatMap(() => [0, 0])
          : uvs.flatMap(_ => [..._]),
      );
      count = indices.length * 3;
    },
  );

  const updateTextureUrl = cache(
    () => properties.textureUrl?.(),
    url => {
      if (!url) {
        texture?.dispose();
        texture = undefined;
        return;
      }
      const newTexture = createImageTexture({
        gl,
        url,
        onLoad: () => {
          gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_MIN_FILTER,
            gl.LINEAR_MIPMAP_LINEAR,
          );
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.generateMipmap(gl.TEXTURE_2D);
          texture?.dispose();
          texture = newTexture;
        },
      });
    },
  );

  const dispose = () => {
    vertexBuffer.dispose();
    indexBuffer.dispose();
    normalBuffer.dispose();
    uvBuffer.dispose();
    texture?.dispose();
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
    uvBuffer,
  }: {
    vertexBuffer: Buffer;
    indexBuffer: Buffer;
    normalBuffer: Buffer;
    uvBuffer: Buffer;
  },
) => {
  const createRenderProgram = (depth = false) => {
    const program = programs.get({
      vertexSource,
      fragmentSource: depth ? depthSource : fragmentSource,
    });

    const vertexAttribute = program.attribute3f("vertex", vertexBuffer);
    const normalAttribute = program.attribute3f("normal", normalBuffer);
    const uvAttribute = program.attribute2f("uv", uvBuffer);

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
    const textureUniform = program.uniform1i("texture");

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
      texture,
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
      texture?: Texture;
    }) => {
      program.use();

      vertexAttribute.use();
      normalAttribute.use();
      uvAttribute.use();

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

      if (!depth && texture) {
        gl.activeTexture(gl.TEXTURE0);
        textureUniform.set(0);
        texture.use();
      }

      indexBuffer.use();

      gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, 0);
    };

    return { execute };
  };

  const renderProgram = createRenderProgram();
  const depthProgram = createRenderProgram(true);

  return { renderProgram, depthProgram };
};
