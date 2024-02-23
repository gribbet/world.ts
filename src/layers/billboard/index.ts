import type { mat4, vec2, vec3, vec4 } from "gl-matrix";

import type { Layer, Properties } from "..";
import { cache, createMouseEvents, type Billboard } from "..";
import type { Buffer } from "../../buffer";
import { createBuffer } from "../../buffer";
import { Context } from "../../context";
import { mercator } from "../../math";
import type { Viewport } from "../../viewport";
import { configure, to } from "../common";
import depthSource from "../depth.glsl";
import { createImageTexture } from "../terrain/image-texture";
import type { Texture } from "../terrain/texture";
import fragmentSource from "./fragment.glsl";
import vertexSource from "./vertex.glsl";

export const createBillboardLayer = (
  context: Context,
  properties: Properties<Partial<Billboard>> = {}
) => {
  const { gl } = context;
  let image: Texture | undefined;
  let imageSize: vec2 = [0, 0];

  const cornerBuffer = createBuffer({ gl, type: "f32", target: "array" });
  const uvBuffer = createBuffer({ gl, type: "f32", target: "array" });
  const indexBuffer = createBuffer({ gl, type: "u16", target: "element" });

  cornerBuffer.set(
    [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ].flat()
  );
  uvBuffer.set(
    [
      [0, 1],
      [0, 0],
      [1, 1],
      [1, 0],
    ].flat()
  );
  indexBuffer.set(
    [
      [0, 1, 3],
      [0, 3, 2],
    ].flat()
  );

  const updateUrl = cache(
    () => properties.url?.() ?? "",
    url => {
      const newImage = createImageTexture({
        gl,
        url,
        onLoad: ({ width, height }) => {
          imageSize = [width, height];
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          image?.dispose();
          image = newImage;
        },
      });
    }
  );

  const { renderProgram, depthProgram } = createPrograms(context, {
    cornerBuffer,
    uvBuffer,
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
    const position = properties.position?.() ?? [0, 0, 0];
    const color = properties.color?.() ?? [1, 1, 1, 1];
    const size = properties.size?.() ?? 100;
    const minSizePixels = properties.minSizePixels?.() ?? 0;
    const maxSizePixels = properties.maxSizePixels?.() ?? Number.MAX_VALUE;

    updateUrl();

    if (!image) return;

    if (configure(gl, depth, properties)) return;

    const program = depth ? depthProgram : renderProgram;

    program.execute({
      projection,
      modelView,
      camera: to(camera),
      screen,
      image,
      imageSize,
      position: to(mercator(position)),
      color: color,
      size: size,
      minSizePixels,
      maxSizePixels,
      index,
    });
  };

  const dispose = () => {
    cornerBuffer.dispose();
    uvBuffer.dispose();
    indexBuffer.dispose();
    image?.dispose();
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
    cornerBuffer,
    uvBuffer,
    indexBuffer,
  }: {
    cornerBuffer: Buffer;
    uvBuffer: Buffer;
    indexBuffer: Buffer;
  }
) => {
  const createRenderProgram = (depth = false) => {
    const program = programs.get({
      vertexSource,
      fragmentSource: depth ? depthSource : fragmentSource,
    });

    const cornerAttribute = program.attribute2f("corner", cornerBuffer, {
      stride: 2 * Float32Array.BYTES_PER_ELEMENT,
    });
    const uvAttribute = program.attribute2f("uv", uvBuffer, {
      stride: 2 * Float32Array.BYTES_PER_ELEMENT,
    });

    const projectionUniform = program.uniformMatrix4f("projection");
    const modelViewUniform = program.uniformMatrix4f("model_view");
    const cameraUniform = program.uniform3i("camera");
    const screenUniform = program.uniform2f("screen");
    const imageUniform = program.uniform1i("image");
    const imageSizeUniform = program.uniform2f("image_size");
    const positionUniform = program.uniform3i("position");
    const colorUniform = program.uniform4f("color");
    const indexUniform = program.uniform1i("index");
    const sizeUniform = program.uniform1f("size");
    const minSizePixelsUniform = program.uniform1f("min_size_pixels");
    const maxSizePixelsUniform = program.uniform1f("max_size_pixels");

    const execute = ({
      projection,
      modelView,
      camera,
      screen,
      image,
      imageSize,
      position,
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
      image: Texture;
      imageSize: vec2;
      position: vec3;
      color: vec4;
      size: number;
      minSizePixels: number;
      maxSizePixels: number;
      index: number;
    }) => {
      program.use();

      cornerAttribute.use();
      uvAttribute.use();

      projectionUniform.set(projection);
      modelViewUniform.set(modelView);
      cameraUniform.set(camera);
      screenUniform.set(screen);
      imageSizeUniform.set(imageSize);
      positionUniform.set(position);
      colorUniform.set(color);
      sizeUniform.set(size);
      minSizePixelsUniform.set(minSizePixels);
      maxSizePixelsUniform.set(maxSizePixels);
      indexUniform.set(index);

      gl.activeTexture(gl.TEXTURE0);
      imageUniform.set(0);
      image.use();

      indexBuffer.use();

      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };

    return { execute };
  };

  const renderProgram = createRenderProgram();
  const depthProgram = createRenderProgram(true);

  return { renderProgram, depthProgram };
};
