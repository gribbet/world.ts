import { vec3 } from "gl-matrix";
import { circumference } from "./constants";

export const quadratic = (a: number, b: number, c: number) => {
  const q = Math.sqrt(b * b - 4 * a * c);
  return [(-b - q) / (2 * a), (-b + q) / (2 * a)];
};

export const mercator = ([lng, lat, alt]: vec3, out = vec3.create()) =>
  vec3.set(
    out,
    lng / 360 + 0.5,
    -Math.asinh(Math.tan((lat / 180) * Math.PI)) / (2 * Math.PI) + 0.5,
    alt / circumference
  );

export const geodetic = ([x, y, z]: vec3, out = vec3.create()) =>
  vec3.set(
    out,
    (x - 0.5) * 360,
    (Math.atan(Math.sinh(-(y - 0.5) * (2 * Math.PI))) * 180) / Math.PI,
    z * circumference
  );

export const tileToMercator = ([x, y, z]: vec3, out = vec3.create()) => {
  const k = Math.pow(2, -z);
  return vec3.set(out, x * k, y * k, 0);
};
