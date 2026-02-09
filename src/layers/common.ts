import type { vec3 } from "gl-matrix";

import { type LayerOptions, type Properties, resolve } from ".";

export const one = 2 ** 30;
export const to = ([x = 0, y = 0, z = 0]: vec3) =>
  [Math.floor(x * one), Math.floor(y * one), Math.floor(z * one)] as vec3;

export const configure = (
  gl: WebGL2RenderingContext,
  _depth: boolean,
  options: Properties<Partial<LayerOptions>>,
) => {
  const { pickable, depth, polygonOffset } = {
    pickable: () => true,
    depth: () => true,
    polygonOffset: () => 0,
    ...options,
  };
  if (resolve(depth)) gl.enable(gl.DEPTH_TEST);
  else gl.disable(gl.DEPTH_TEST);

  if (_depth) {
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.disable(gl.BLEND);
    if (!resolve(pickable)) return true;
  } else {
    if (resolve(polygonOffset)) {
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(0, resolve(polygonOffset) ?? 0);
    } else gl.disable(gl.POLYGON_OFFSET_FILL);

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
    );
  }
};
