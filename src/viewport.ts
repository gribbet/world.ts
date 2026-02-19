import { mat4, vec2, vec3, vec4 } from "gl-matrix";

import {
  circumference,
  geodetic,
  mercator,
  quadratic,
  radians,
  toQuaternion,
} from "./math";
import { defaultView, type View } from "./model";

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
  project: (_: vec3) => vec2;
  unproject: (_: vec2, options?: { targetZ: number | undefined }) => vec3;
};

export const createViewport: (view: Partial<View>, screen: vec2) => Viewport = (
  view,
  screen,
) => {
  const { target, offset, distance, orientation, fieldOfView } = {
    ...defaultView,
    ...view,
  };
  const [width = 0, height = 0] = screen;
  const [ox = 0, oy = 0] = offset;
  const fieldScale =
    Math.tan(radians(45) / 2) / Math.tan(radians(fieldOfView) / 2);
  const z = (distance / circumference) * fieldScale;
  const minZ = Math.max(1000 / circumference, z);
  const farScale = 1e3;
  const nearScale = 1e-3;
  const far = minZ * farScale;
  const near = minZ * nearScale;

  const vector = vec4.create();

  const projection = mat4.create();
  mat4.identity(projection);
  mat4.perspective(projection, radians(fieldOfView), width / height, near, far);
  mat4.scale(projection, projection, [1, -1, 1]);

  const modelView = mat4.create();
  mat4.fromQuat(modelView, toQuaternion(orientation));
  const transform = mat4.multiply(mat4.create(), projection, modelView);
  const inverse = mat4.invert(mat4.create(), transform);
  if (!inverse) throw new Error("No inverse");

  const scale = (scale: number) => {
    const screen: vec2 = [width * scale, height * scale];
    const offset: vec2 = [ox * scale, oy * scale];
    return createViewport({ ...view, offset }, screen);
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
    w < 0
      ? out
      : vec2.set(out, (1 + x / w) * width * 0.5, (1 - y / w) * height * 0.5);

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
    (bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2,
    2 * (ax * (bx - ax) + ay * (by - ay) + az * (bz - az)),
    ax ** 2 + ay ** 2 + az ** 2 - z ** 2,
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

  const project = (_: vec3) =>
    clipToScreen(localToClip(worldToLocal(mercator(_))));

  const unproject = (_: vec2, { targetZ = 0 }: { targetZ?: number } = {}) => {
    const clip1 = screenToClip(_);
    const [cx = 0, cy = 0, , cw = 0] = clip1;
    const clip2 = [cx, cy, -1, cw] satisfies vec4;

    const world1 = geodetic(localToWorld(clipToLocal(clip1)));
    const world2 = geodetic(localToWorld(clipToLocal(clip2)));

    const [, , z1 = 0] = world1;
    const [, , z2 = 0] = world2;

    const t = z1 === z2 ? 0 : (targetZ - z1) / (z2 - z1);
    return vec3.lerp(vec3.create(), world1, world2, t);
  };

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
    project,
    unproject,
  } satisfies Viewport;
};
