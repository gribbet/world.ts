import earcut, { flatten } from "earcut";
import type { mat4, vec2, vec3, vec4 } from "gl-matrix";

import type { Buffer } from "../../buffer";
import { createBuffer } from "../../buffer";
import type { Context } from "../../context";
import { createImageLoad } from "../../image-load";
import { mercator } from "../../math";
import type { Viewport } from "../../viewport";
import type { Layer, Polygon, Properties } from "..";
import { cache, createMouseEvents, resolve } from "..";
import { configure, to, white } from "../common";
import depthSource from "../depth.glsl";
import { createTexture, type Texture } from "../terrain/texture";
import fragmentSource from "./fragment.glsl";
import vertexSource from "./vertex.glsl";

export const createPolygonLayer = (
  context: Context,
  properties: Properties<Partial<Polygon>> = {},
) => {
  const { gl } = context;
  let count = 0;

  const positionBuffer = createBuffer({ gl, type: "i32", target: "array" });
  const uvBuffer = createBuffer({ gl, type: "f32", target: "array" });
  const indexBuffer = createBuffer({ gl, type: "u16", target: "element" });

  const { renderProgram, depthProgram } = createPrograms(context, {
    positionBuffer,
    uvBuffer,
    indexBuffer,
  });

  const image = createTexture(gl);
  image.use();
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

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
    resolve(updateImageUrl);

    if (configure(gl, depth, properties)) return;

    const program = depth ? depthProgram : renderProgram;

    program.execute({
      projection,
      modelView,
      camera: to(camera),
      screen,
      count,
      color,
      image,
      index,
    });
  };

  const updatePoints = cache(properties.points, (_ = []) => {
    const coordinates = _.map(_ =>
      _.map(_ => _.map(_ => to(mercator(_)))).filter(_ => _.length > 0),
    ).filter(_ => _.length > 0);
    const { vertices, indices } = triangulate(coordinates);
    positionBuffer.set(vertices);
    indexBuffer.set(indices);
    uvBuffer.set(generateUvs(coordinates));
    count = indices.length;
  });

  const updateImageUrl = cache(properties.imageUrl, (url = white) => {
    createImageLoad({
      url,
      onLoad: _ => {
        if (!_) return;
        image.use();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, _);
        gl.generateMipmap(gl.TEXTURE_2D);
      },
    });
  });

  const dispose = () => {
    positionBuffer.dispose();
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
    positionBuffer,
    uvBuffer,
    indexBuffer,
  }: {
    positionBuffer: Buffer<"i32">;
    uvBuffer: Buffer<"f32">;
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

    const uvAttribute = program.attribute2f("uv", uvBuffer);

    const projectionUniform = program.uniformMatrix4f("projection");
    const modelViewUniform = program.uniformMatrix4f("model_view");
    const cameraUniform = program.uniform3i("camera");
    const screenUniform = program.uniform2f("screen");
    const colorUniform = program.uniform4f("color");
    const imageUniform = program.uniform1i("image");
    const indexUniform = program.uniform1i("index");

    const execute = ({
      projection,
      modelView,
      camera,
      screen,
      count,
      color,
      image,
      index,
    }: {
      projection: mat4;
      modelView: mat4;
      camera: vec3;
      screen: vec2;
      count: number;
      color: vec4;
      image: Texture;
      index: number;
    }) => {
      if (count === 0) return;

      program.use();

      positionAttribute.use();
      uvAttribute.use();

      projectionUniform.set(projection);
      modelViewUniform.set(modelView);
      cameraUniform.set(camera);
      screenUniform.set(screen);
      colorUniform.set(color);
      indexUniform.set(index);

      image.use();
      imageUniform.set(0);

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

const generateUvs = (coordinates: vec3[][][]) => {
  const points = coordinates.flat(2);
  const { minX, minY, maxX, maxY } = points.reduce(
    ({ minX, minY, maxX, maxY }, [x = 0, y = 0]) => ({
      minX: Math.min(minX, x),
      minY: Math.min(minY, y),
      maxX: Math.max(maxX, x),
      maxY: Math.max(maxY, y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  return points.flatMap(([x = 0, y = 0]) => [(x - minX) / dx, (y - minY) / dy]);
};
