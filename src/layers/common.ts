import type { vec3 } from "gl-matrix";

export const one = 2 ** 30;
export const to = ([x = 0, y = 0, z = 0]: vec3) =>
  [Math.floor(x * one), Math.floor(y * one), Math.floor(z * one)] as vec3;

export const configure = (
  gl: WebGL2RenderingContext,
  { depth, pickable }: { depth: boolean; pickable: boolean },
) => {
  gl.enable(gl.DEPTH_TEST);
  if (depth) {
    gl.disable(gl.BLEND);
    if (!pickable) return true;
  } else {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }
};
