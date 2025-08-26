import type { mat4, vec2, vec4 } from "gl-matrix";
import { vec3 } from "gl-matrix";

import type { Buffer } from "../../buffer";
import { createBuffer } from "../../buffer";
import { range } from "../../common";
import type { Context } from "../../context";
import { circumference, mercator } from "../../math";
import type { Viewport } from "../../viewport";
import type { Layer, Line, Properties } from "../";
import { cache, createMouseEvents } from "../";
import { configure, to } from "../common";
import depthSource from "../depth.glsl";
import { createTexture, type Texture } from "../terrain/texture";
import fragmentSource from "./fragment.glsl";
import vertexSource from "./vertex.glsl";

export const createLineLayer = (
  context: Context,
  properties: Properties<Partial<Line>> = {},
) => {
  const { gl } = context;
  let count = 0;

  const positionBuffer = createBuffer({ gl, type: "i32", target: "array" });
  const indexBuffer = createBuffer({ gl, type: "u16", target: "element" });
  const cornerBuffer = createBuffer({ gl, type: "f32", target: "array" });
  const distanceBuffer = createBuffer({ gl, type: "f32", target: "array" });

  const { renderProgram, depthProgram } = createPrograms(context, {
    positionBuffer,
    indexBuffer,
    cornerBuffer,
    distanceBuffer,
  });

  const dash = createTexture(gl);
  dash.use();
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

  const render = ({
    viewport: { projection, modelView, camera, screen },
    depth = false,
    index = 0,
  }: {
    viewport: Viewport;
    depth?: boolean;
    index?: number;
  }) => {
    updatePoints();
    updateDashPattern();

    const color = properties.color?.() ?? [1, 1, 1, 1];
    const width = properties.width?.() ?? 1;
    const minWidthPixels = properties.minWidthPixels?.() ?? 0;
    const maxWidthPixels = properties.maxWidthPixels?.() ?? Number.MAX_VALUE;
    const depthWidthPixels = properties.depthWidthPixels?.();
    const dashSize = properties.dashSize?.() ?? 1000;
    const dashOffset = properties.dashOffset?.() ?? 0;

    if (configure(gl, depth, properties)) return;

    const program = depth ? depthProgram : renderProgram;

    program.execute({
      projection,
      modelView,
      camera: to(camera),
      screen,
      count,
      color,
      width,
      minWidthPixels:
        depth && depthWidthPixels !== undefined
          ? Math.max(minWidthPixels, depthWidthPixels)
          : minWidthPixels,
      maxWidthPixels:
        depth && depthWidthPixels !== undefined
          ? Math.max(maxWidthPixels, depthWidthPixels)
          : maxWidthPixels,
      index,
      dash,
      dashSize,
      dashOffset,
    });
  };

  const updatePoints = cache(
    () => properties.points?.() ?? [],
    _ => {
      const positionData = _.flatMap(_ => {
        const [first] = _;
        const [last] = _.slice(-1);

        if (!first || !last) return [];

        const repeat = (_: vec3[]) => {
          const result = new Array<number>(_.length * 3 * 4);
          for (let i = 0; i < _.length; i++) {
            const [x = 0, y = 0, z = 0] = _[i] ?? [];
            for (let j = 0; j < 4; j++) {
              const q = i * 3 * 4 + j * 3;
              result[q + 0] = x;
              result[q + 1] = y;
              result[q + 2] = z;
            }
          }
          return result;
        };

        return repeat([first, ..._, last].map(_ => to(mercator(_))));
      });

      const { indexData } = _.reduce<{
        indexData: number[];
        count: number;
      }>(
        ({ indexData, count }, _) => {
          if (_.length === 0) return { indexData, count };
          const indices = range(0, (_.length - 1) * 2).flatMap(i => {
            const [a = 0, b = 0, c = 0, d = 0] = [0, 1, 2, 3].map(
              _ => _ + i * 2 + count,
            );
            return [a, b, d, /**/ a, d, c];
          });
          count += (_.length + 2) * 4;
          indexData = indexData.concat(indices);
          return { indexData, count };
        },
        { indexData: [], count: 0 },
      );
      count = indexData.length;

      const cornerData = _.flatMap(_ =>
        _.length === 0
          ? []
          : range(0, (_.length + 1) * 2).flatMap(() => [
              -1, -1,
              //
              -1, 1,
              //
              1, -1,
              //
              1, 1,
            ]),
      );

      const distanceData = _.flatMap(points => {
        const distances = points.map(
          (_, i) =>
            vec3.distance(mercator(_), mercator(points[i - 1] ?? _)) *
            circumference,
        );
        const accumulated = distances.reduce(
          ({ current, result }, distance) => {
            current += distance;
            result.push(current);
            return { current, result };
          },
          { current: 0, result: [] as number[] },
        ).result;

        const [first] = accumulated;
        const [last] = accumulated.slice(-1);

        if (first === undefined || last === undefined) return [];

        const repeat = (_: number[]) => {
          const result = new Array<number>(_.length * 4);
          for (let i = 0; i < _.length; i++) {
            const x = _[i] ?? 0;
            result[i * 4 + 0] = x;
            result[i * 4 + 1] = x;
            result[i * 4 + 2] = x;
            result[i * 4 + 3] = x;
          }
          return result;
        };

        return repeat([first, ...accumulated, last]);
      });

      positionBuffer.set(positionData);
      indexBuffer.set(indexData);
      cornerBuffer.set(cornerData);
      distanceBuffer.set(distanceData);
    },
  );

  const updateDashPattern = cache(
    () => properties.dashPattern?.(),
    dashPattern => {
      dashPattern = dashPattern ?? [[1, 1, 1, 1]];
      dash.use();
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        dashPattern.length,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array(dashPattern.flatMap(_ => [..._.map(_ => _ * 255)])),
      );
    },
  );

  const dispose = () => {
    dash.dispose();
    positionBuffer.dispose();
    indexBuffer.dispose();
    cornerBuffer.dispose();
    distanceBuffer.dispose();
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
    indexBuffer,
    cornerBuffer,
    distanceBuffer,
  }: {
    positionBuffer: Buffer;
    indexBuffer: Buffer;
    cornerBuffer: Buffer;
    distanceBuffer: Buffer;
  },
) => {
  const createRenderProgram = (depth = false) => {
    const program = programs.get({
      vertexSource,
      fragmentSource: depth ? depthSource : fragmentSource,
    });

    const floatBytes = Float32Array.BYTES_PER_ELEMENT;
    const intBytes = Int32Array.BYTES_PER_ELEMENT;

    const previousAttribute = program.attribute3i("previous", positionBuffer, {
      stride: intBytes * 3,
    });
    const currentAttribute = program.attribute3i("current", positionBuffer, {
      stride: intBytes * 3,
      offset: intBytes * 3 * 4,
    });
    const nextAttribute = program.attribute3i("next", positionBuffer, {
      stride: intBytes * 3,
      offset: intBytes * 3 * 4 * 2,
    });
    const cornerAttribute = program.attribute2f("corner", cornerBuffer, {
      stride: floatBytes * 2,
    });
    const distanceAttribute = program.attribute1f("distance", distanceBuffer, {
      stride: floatBytes,
      offset: floatBytes * 1 * 4,
    });

    const projectionUniform = program.uniformMatrix4f("projection");
    const modelViewUniform = program.uniformMatrix4f("model_view");
    const cameraUniform = program.uniform3i("camera");
    const screenUniform = program.uniform2f("screen");
    const colorUniform = program.uniform4f("color");
    const widthUniform = program.uniform1f("width");
    const maxWidthPixelsUniform = program.uniform1f("max_width_pixels");
    const minWidthPixelsUniform = program.uniform1f("min_width_pixels");
    const indexUniform = program.uniform1i("index");
    const dashUniform = program.uniform1i("dash");
    const dashSizeUniform = program.uniform1f("dash_size");
    const dashOffsetUniform = program.uniform1f("dash_offset");

    const execute = ({
      projection,
      modelView,
      camera,
      screen,
      count,
      color,
      width,
      minWidthPixels,
      maxWidthPixels,
      index,
      dash,
      dashSize,
      dashOffset,
    }: {
      projection: mat4;
      modelView: mat4;
      camera: vec3;
      screen: vec2;
      count: number;
      color: vec4;
      width: number;
      minWidthPixels: number;
      maxWidthPixels: number;
      index: number;
      dash: Texture;
      dashSize: number;
      dashOffset: number;
    }) => {
      if (count === 0) return;

      program.use();

      previousAttribute.use();
      currentAttribute.use();
      nextAttribute.use();
      cornerAttribute.use();
      distanceAttribute.use();

      projectionUniform.set(projection);
      modelViewUniform.set(modelView);
      cameraUniform.set(camera);
      screenUniform.set(screen);
      colorUniform.set(color);
      widthUniform.set(width);
      minWidthPixelsUniform.set(minWidthPixels);
      maxWidthPixelsUniform.set(maxWidthPixels);
      indexUniform.set(index);
      dashSizeUniform.set(dashSize);
      dashOffsetUniform.set(dashOffset);

      gl.activeTexture(gl.TEXTURE0);
      dashUniform.set(0);
      dash.use();

      indexBuffer.use();

      gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
    };

    return { execute };
  };

  const renderProgram = createRenderProgram();
  const depthProgram = createRenderProgram(true);

  return { renderProgram, depthProgram };
};
