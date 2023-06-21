import { vec3 } from "gl-matrix";

export const one = 2 ** 30;
export const to = ([x, y, z]: vec3) =>
  [Math.floor(x * one), Math.floor(y * one), Math.floor(z * one)] as vec3;
