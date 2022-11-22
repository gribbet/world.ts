import { mat4, vec2, vec3, vec4 } from "gl-matrix";

export type View = {
  camera: vec3;
  screen: vec2;
  bearing: number;
  pitch: number;
};

export type Viewport = {
  view: View;
  projection: mat4;
  modelView: mat4;
  screenToClip: (_: vec2, out?: vec4) => vec4;
  clipToScreen: (_: vec4, out?: vec2) => vec2;
  clipToLocal: (_: vec4, out?: vec3) => vec3;
  localToClip: (_: vec3, out?: vec4) => vec4;
  localToWorld: (_: vec3, out?: vec3) => vec3;
  worldToLocal: (_: vec3, out?: vec3) => vec3;
};

const matrix = mat4.create();
const vector = vec4.create();

export const createViewport: (view: View) => Viewport = (view) => {
  const {
    camera,
    screen: [width, height],
    pitch,
    bearing,
  } = view;
  const [, , z] = camera;
  const near = z / 100;
  const far = z * 100;

  const projection = mat4.create();
  mat4.identity(projection);
  mat4.perspective(projection, (45 * Math.PI) / 180, width / height, near, far);
  mat4.scale(projection, projection, [1, -1, 1]);

  const modelView = mat4.create();
  mat4.identity(modelView);
  mat4.rotateX(modelView, modelView, pitch);
  mat4.rotateZ(modelView, modelView, bearing);

  const transform = mat4.multiply(matrix, projection, modelView);
  const inverse = mat4.invert(mat4.create(), transform);

  const screenToClip = ([screenX, screenY]: vec2, out = vec4.create()) => {
    const x = (2 * screenX) / width - 1;
    const y = -((2 * screenY) / height - 1);
    return vec4.set(out, x, y, 0, 1);
  };

  const clipToScreen = ([x, y, , w]: vec4, out = vec2.create()) =>
    vec2.set(out, (x / w + 1) * width * 0.5, (1 - y / w) * height * 0.5);

  const clipToLocal = (v: vec4, out = vec3.create()) => {
    const [x, y, z, w] = vec4.transformMat4(vector, v, inverse);
    return vec3.set(out, x / w, y / w, z / w);
  };

  const localToClip = ([x, y, z]: vec3, out = vec4.create()) =>
    vec4.transformMat4(out, vec4.set(out, x, y, z, 1), transform);

  const localToWorld = (v: vec3, out = vec3.create()) =>
    vec3.add(out, v, camera);

  const worldToLocal = (v: vec3, out = vec3.create()) =>
    vec3.sub(out, v, camera);

  return {
    view,
    projection,
    modelView,
    screenToClip,
    clipToScreen,
    clipToLocal,
    localToClip,
    localToWorld,
    worldToLocal,
  };
};
