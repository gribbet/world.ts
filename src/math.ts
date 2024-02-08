import { vec3 } from "gl-matrix";

import { circumference } from "./constants";

export const radians = (_: number) => (_ / 180) * Math.PI;

export const degrees = (_: number) => (_ * 180) / Math.PI;

export const quadratic = (a: number, b: number, c: number) => {
  const q = Math.sqrt(b * b - 4 * a * c);
  return [(-b - q) / (2 * a), (-b + q) / (2 * a)];
};

export const mercator = (
  [lng = 0, lat = 0, alt = 0]: vec3,
  out = vec3.create(),
) =>
  vec3.set(
    out,
    lng / 360 + 0.5,
    -Math.asinh(Math.tan(radians(lat))) / (2 * Math.PI) + 0.5,
    alt / circumference,
  );

export const geodetic = ([x = 0, y = 0, z = 0]: vec3, out = vec3.create()) =>
  vec3.set(
    out,
    (x - 0.5) * 360,
    degrees(Math.atan(Math.sinh(-(y - 0.5) * (2 * Math.PI)))),
    z * circumference,
  );

export const tileToMercator = (
  [x = 0, y = 0, z = 0]: vec3,
  out = vec3.create(),
) => {
  const k = 2 ** -z;
  return vec3.set(out, x * k, y * k, 0);
};
