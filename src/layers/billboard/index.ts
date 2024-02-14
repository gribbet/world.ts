import type { mat4, vec2, vec4 } from "gl-matrix";
import type { vec3 } from "gl-matrix";

import type { Buffer } from "../../buffer";
import { createBuffer } from "../../buffer";
import { mercator } from "../../math";
import { createProgram } from "../../program";
import type { Viewport } from "../../viewport";
import type { World } from "../../world";
import type { LayerOptions } from "..";
import { type BaseLayer, type Billboard } from "..";
import { configure, to } from "../common";
import depthSource from "../depth.glsl";
import { createImageTexture } from "../terrain/image-texture";
import type { Texture } from "../terrain/texture";
import fragmentSource from "./fragment.glsl";
import vertexSource from "./vertex.glsl";

export type BillboardLayer = BaseLayer & Billboard;

export const createBillboardLayer = (
  world: World,
  billboard: Partial<Billboard> = {},
) => {
  const { gl } = world;
  let { options, url, position, color, size, minSizePixels, maxSizePixels } = {
    options: {},
    url: "",
    position: [0, 0, 0],
    color: [1, 1, 1, 1],
    size: 100,
    ...billboard,
  } satisfies Billboard;
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
    ].flat(),
  );
  uvBuffer.set(
    [
      [0, 1],
      [0, 0],
      [1, 1],
      [1, 0],
    ].flat(),
  );
  indexBuffer.set(
    [
      [0, 1, 3],
      [0, 3, 2],
    ].flat(),
  );

  let image: Texture | undefined;

  const update = () => {
    image?.dispose();
    image = createImageTexture({
      gl,
      url,
      onLoad: ({ width, height }) => {
        imageSize = [width, height];
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      },
    });
  };

  update();

  const { renderProgram, depthProgram } = createPrograms(gl, {
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
    if (configure(gl, depth, options)) return;
    if (!image) return;
    const program = depth ? depthProgram : renderProgram;
    program.execute({
      projection,
      modelView,
      camera: to(camera),
      screen,
      image,
      imageSize,
      position: to(mercator(position)),
      color,
      size,
      minSizePixels: minSizePixels || 0,
      maxSizePixels: maxSizePixels || Number.MAX_VALUE,
      index,
    });
  };

  const dispose = () => {
    cornerBuffer.dispose();
    uvBuffer.dispose();
    indexBuffer.dispose();
    renderProgram.dispose();
    depthProgram.dispose();
    image?.dispose();
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
    get url() {
      return url;
    },
    set url(_: string) {
      url = _;
      update();
    },
    get position() {
      return position;
    },
    set position(_: vec3) {
      position = _;
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
  } satisfies BillboardLayer;

  world.add(layer);

  return layer;
};

const createPrograms = (
  gl: WebGL2RenderingContext,
  {
    cornerBuffer,
    uvBuffer,
    indexBuffer,
  }: {
    cornerBuffer: Buffer;
    uvBuffer: Buffer;
    indexBuffer: Buffer;
  },
) => {
  const createRenderProgram = (depth = false) => {
    const program = createProgram({
      gl,
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

    const { dispose } = program;

    return { execute, dispose };
  };

  const renderProgram = createRenderProgram();
  const depthProgram = createRenderProgram(true);

  return { renderProgram, depthProgram };
};
