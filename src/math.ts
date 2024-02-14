import type { quat } from "gl-matrix";
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

export const toQuaternion = ([pitch = 0, yaw = 0, roll = 0]: vec3) => {
  const cy = Math.cos(yaw * 0.5);
  const sy = Math.sin(yaw * 0.5);
  const cp = Math.cos(pitch * 0.5);
  const sp = Math.sin(pitch * 0.5);
  const cr = Math.cos(roll * 0.5);
  const sr = Math.sin(roll * 0.5);

  const w = cr * cp * cy + sr * sp * sy;
  const x = sr * cp * cy - cr * sp * sy;
  const y = cr * sp * cy + sr * cp * sy;
  const z = cr * cp * sy - sr * sp * cy;

  return [x, y, z, w] satisfies quat;
};

export const toOrientation = ([x = 0, y = 0, z = 0, w = 0]: quat) => {
  const roll = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
  const pitch = Math.asin(2 * (w * y - z * x));
  const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  return [pitch, yaw, roll] satisfies vec3;
};
