import { mat4, vec2, vec3, vec4 } from "gl-matrix";

import { circumference } from "./constants";
import { mercator, quadratic, radians } from "./math";
import type { View } from "./model";

export type Viewport = {
  camera: vec3;
  screen: vec2;
  projection: mat4;
  modelView: mat4;
  fieldScale: number;
  scale: (_: number) => Viewport;
  screenToClip: (_: vec2, out?: vec4) => vec4;
  clipToScreen: (_: vec4, out?: vec2) => vec2;
  clipToLocal: (_: vec4, out?: vec3) => vec3;
  localToClip: (_: vec3, out?: vec4) => vec4;
  localToWorld: (_: vec3, out?: vec3) => vec3;
  worldToLocal: (_: vec3, out?: vec3) => vec3;
};

const matrix = mat4.create();
const vector = vec4.create();

export const createViewport: (view: View) => Viewport = view => {
  const {
    target,
    screen,
    orientation: [pitch, roll, yaw],
    fieldOfView,
  } = view;
  const [width = 0, height = 0] = screen;
  const [ox = 0, oy = 0] = view.offset;
  const fieldScale =
    Math.tan(radians(45) / 2) / Math.tan(radians(fieldOfView) / 2);
  const z = (view.distance / circumference) * fieldScale;
  const near = z / 100;
  const far = z * 1000000;

  const projection = mat4.create();
  mat4.identity(projection);
  mat4.perspective(projection, radians(fieldOfView), width / height, near, far);
  mat4.scale(projection, projection, [1, -1, 1]);

  const modelView = mat4.create();
  mat4.identity(modelView);
  mat4.rotateX(modelView, modelView, pitch);
  mat4.rotateY(modelView, modelView, roll);
  mat4.rotateZ(modelView, modelView, yaw);

  const transform = mat4.multiply(matrix, projection, modelView);
  const inverse = mat4.invert(mat4.create(), transform);

  const scale = (scale: number) => {
    const screen: vec2 = [width * scale, height * scale];
    const offset: vec2 = [ox * scale, oy * scale];
    return createViewport({ ...view, offset, screen });
  };

  const screenToClip = (
    [screenX = 0, screenY = 0]: vec2,
    out = vec4.create(),
  ) => {
    const x = (2 * screenX) / width - 1;
    const y = -((2 * screenY) / height - 1);
    return vec4.set(out, x, y, 0, 1);
  };

  const clipToScreen = ([x = 0, y = 0, , w = 0]: vec4, out = vec2.create()) =>
    vec2.set(out, (1 + x / w) * width * 0.5, (1 - y / w) * height * 0.5);

  const clipToLocal = (v: vec4, out = vec3.create()) => {
    const [x = 0, y = 0, z = 0, w = 0] = vec4.transformMat4(vector, v, inverse);
    return vec3.set(out, x / w, y / w, z / w);
  };

  const localToClip = ([x = 0, y = 0, z = 0]: vec3, out = vec4.create()) =>
    vec4.transformMat4(out, vec4.set(out, x, y, z, 1), transform);

  const [cx = 0, cy = 0] = screenToClip([ox + width / 2, oy + height / 2]);
  const [ax = 0, ay = 0, az = 0] = clipToLocal([cx, cy, -1, 1]);
  const [bx = 0, by = 0, bz = 0] = clipToLocal([cx, cy, 1.00001, 1]);

  const [t1 = 0] = quadratic(
    (bx - ax) * (bx - ax) + (by - ay) * (by - ay) + (bz - az) * (bz - az),
    ax * (bx - ax) + ay * (by - ay) + az * (bz - az),
    ax * ax +
      ay * ay +
      az * az -
      ((view.distance * view.distance) / circumference / circumference) *
        fieldScale *
        fieldScale,
  );

  if (isNaN(t1)) throw new Error("Unexpected");

  const local: vec3 = [
    ax + t1 * (bx - ax),
    ay + t1 * (by - ay),
    az + t1 * (bz - az),
  ];

  const camera = vec3.sub(vec3.create(), mercator(target), local);

  const localToWorld = (v: vec3, out = vec3.create()) =>
    vec3.add(out, v, camera);

  const worldToLocal = (v: vec3, out = vec3.create()) =>
    vec3.sub(out, v, camera);

  return {
    camera,
    screen,
    projection,
    modelView,
    fieldScale,
    scale,
    screenToClip,
    clipToScreen,
    clipToLocal,
    localToClip,
    localToWorld,
    worldToLocal,
  };
};
