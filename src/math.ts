import type { quat } from "gl-matrix";
import { vec3 } from "gl-matrix";

export const circumference = 40075017;

export const radians = (_: number) => (_ / 180) * Math.PI;

export const degrees = (_: number) => (_ * 180) / Math.PI;

export const quadratic = (a: number, b: number, c: number) => {
  const q = Math.sqrt(b * b - 4 * a * c);
  return [(-b - q) / (2 * a), (-b + q) / (2 * a)];
};

const clamp = (x: number, min: number, max: number) =>
  Math.min(Math.max(x, min), max);

const limit = Math.atan(Math.sinh(Math.PI));

export const mercator = (
  [lng = 0, lat = 0, alt = 0]: vec3,
  out = vec3.create(),
) =>
  vec3.set(
    out,
    lng / 360 + 0.5,
    -Math.asinh(Math.tan(clamp(radians(lat), -limit, limit))) / (2 * Math.PI) +
      0.5,
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

export const toQuaternion = ([pitch = 0, roll = 0, yaw = 0]: vec3): quat => {
  const cx = Math.cos(pitch * 0.5);
  const sx = Math.sin(pitch * 0.5);
  const cy = Math.cos(roll * 0.5);
  const sy = Math.sin(roll * 0.5);
  const cz = Math.cos(yaw * 0.5);
  const sz = Math.sin(yaw * 0.5);
  const x = sx * cy * cz + cx * sy * sz;
  const y = cx * sy * cz - sx * cy * sz;
  const z = cx * cy * sz + sx * sy * cz;
  const w = cx * cy * cz - sx * sy * sz;
  return [x, y, z, w] satisfies quat;
};

export const toOrientation = ([x = 0, y = 0, z = 0, w = 0]: quat): vec3 => {
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(value, max));

  const pitch = Math.atan2(2 * (w * x - y * z), 1 - 2 * (x * x + y * y));
  const roll = Math.asin(clamp(2 * (w * y + z * x), -1, 1));
  const yaw = Math.atan2(2 * (w * z - x * y), 1 - 2 * (y * y + z * z));

  return [pitch, roll, yaw] satisfies vec3;
};
