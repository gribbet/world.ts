import { mat4, vec2, vec3 } from "gl-matrix";

import type { Layer, Properties, Radar } from "..";
import { cache, createMouseEvents } from "..";
import type { Buffer } from "../../buffer";
import { createBuffer } from "../../buffer";
import type { Context } from "../../context";
import { mercator } from "../../math";
import type { Viewport } from "../../viewport";
import { configure, to } from "../common";
import depthSource from "../depth.glsl";
import fragmentSource from "./fragment.glsl";
import vertexSource from "./vertex.glsl";

export const createRadarLayer = (
  context: Context,
  properties: Properties<Partial<Radar>> = {}
) => {
  const { gl } = context;

  let image = createMemoryTexture(gl);

  const uvBuffer = createBuffer({ gl, type: "f32", target: "array" });
  const indexBuffer = createBuffer({ gl, type: "u16", target: "element" });

  uvBuffer.set(
    [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ].flat()
  );
  indexBuffer.set(
    [
      [0, 1, 3],
      [0, 3, 2],
    ].flat()
  );

  const updateImage = cache(
    () => properties.image?.(),
    data => {
      if (data) image.set(data);
    }
  );

  const { renderProgram, depthProgram } = createPrograms(context, {
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
    const orientation = properties.orientation?.() ?? [0, 0, 0, 1];
    const range = properties.range?.() ?? 1000;

    updateImage();

    if (configure(gl, depth, properties)) return;

    const program = depth ? depthProgram : renderProgram;

    program.execute({
      projection,
      modelView,
      camera: to(camera),
      screen,
      image,
      range,
      position: to(mercator(position)),
      orientation: mat4.fromQuat(mat4.create(), orientation),
      index,
    });
  };

  const dispose = () => {
    uvBuffer.dispose();
    indexBuffer.dispose();
    image.dispose();
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
    uvBuffer,
    indexBuffer,
  }: {
    uvBuffer: Buffer;
    indexBuffer: Buffer;
  }
) => {
  const createRenderProgram = (depth = false) => {
    const program = programs.get({
      vertexSource,
      fragmentSource: depth ? depthSource : fragmentSource,
    });

    const uvAttribute = program.attribute2f("uv", uvBuffer, {
      stride: 2 * Float32Array.BYTES_PER_ELEMENT,
    });

    const projectionUniform = program.uniformMatrix4f("projection");
    const modelViewUniform = program.uniformMatrix4f("model_view");
    const cameraUniform = program.uniform3i("camera");
    const screenUniform = program.uniform2f("screen");
    const imageUniform = program.uniform1i("image");
    const rangeUniform = program.uniform1f("range");
    const positionUniform = program.uniform3i("position");
    const orientationUniform = program.uniformMatrix4f("orientation");
    const indexUniform = program.uniform1i("index");

    const execute = ({
      projection,
      modelView,
      camera,
      screen,
      image,
      range,
      position,
      orientation,
      index,
    }: {
      projection: mat4;
      modelView: mat4;
      camera: vec3;
      screen: vec2;
      image: MemoryTexture;
      range: number;
      position: vec3;
      orientation: mat4;
      index: number;
    }) => {
      program.use();

      uvAttribute.use();

      projectionUniform.set(projection);
      modelViewUniform.set(modelView);
      cameraUniform.set(camera);
      screenUniform.set(screen);
      rangeUniform.set(range);
      positionUniform.set(position);
      orientationUniform.set(orientation);
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

export type MemoryTexture = {
  set: (_: ImageData) => void;
  use: () => void;
  dispose: () => void;
};

export const createMemoryTexture = (gl: WebGL2RenderingContext) => {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Texture creation failed");

  const use = () => gl.bindTexture(gl.TEXTURE_2D, texture);

  use();
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

  const dispose = () => gl.deleteTexture(texture);

  const set = (image: ImageData) => {
    use();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  };

  return {
    set,
    use,
    dispose,
  } satisfies MemoryTexture;
};
