import { vec3 } from "gl-matrix";
import { circumference } from "./constants";

export const quadratic = (a: number, b: number, c: number) => {
  const q = Math.sqrt(b * b - 4 * a * c);
  return [(-b - q) / (2 * a), (-b + q) / (2 * a)];
};

export const mercator = ([lng, lat, alt]: vec3) =>
  [
    lng / 360 + 0.5,
    -Math.asinh(Math.tan((lat / 180) * Math.PI)) / (2 * Math.PI) + 0.5,
    alt / circumference,
  ] as vec3;

export const geodetic = ([x, y, z]: vec3) =>
  [
    (x - 0.5) * 360,
    (Math.atan(Math.sinh(-(y - 0.5) * (2 * Math.PI))) * 180) / Math.PI,
    z * circumference,
  ] as vec3;
