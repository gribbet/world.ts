import { mat4, vec2, vec3, vec4 } from "gl-matrix";

export interface View {
  projection: mat4;
  modelView: mat4;
  camera: vec3;
  width: number;
  height: number;
}

interface Viewport {
  screenToClip: (_: vec2, out?: vec4) => vec4;
  clipToScreen: (_: vec4, out?: vec2) => vec2;
  clipToLocal: (_: vec4, out?: vec3) => vec3;
  localToClip: (_: vec3, out?: vec4) => vec4;
  localToWorld: (_: vec3, out?: vec3) => vec3;
  worldToLocal: (_: vec3, out?: vec3) => vec3;
}

const matrix = mat4.create();
const vector = vec4.create();

export const viewport: (view: View) => Viewport = ({
  projection,
  modelView,
  camera,
  width,
  height,
}) => {
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
    screenToClip,
    clipToScreen,
    clipToLocal,
    localToClip,
    localToWorld,
    worldToLocal,
  };
};
