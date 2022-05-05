import { mat4, vec2, vec3, vec4 } from "gl-matrix";

export interface View {
  projection: mat4;
  modelView: mat4;
  camera: vec3;
  width: number;
  height: number;
}

interface Viewport {
  screenToClip: (_: vec2) => vec4;
  clipToScreen: (_: vec4) => vec2;
  clipToLocal: (_: vec4) => vec3;
  localToClip: (_: vec3) => vec4;
  localToWorld: (_: vec3) => vec3;
  worldToLocal: (_: vec3) => vec3;
}

const matrix = mat4.create();

export const viewport: (view: View) => Viewport = ({
  projection,
  modelView,
  camera,
  width,
  height,
}) => {
  const screenToClip = ([screenX, screenY]: vec2) => {
    const x = (2 * screenX) / width - 1;
    const y = -((2 * screenY) / height - 1);
    return [x, y, 0, 1] as vec4;
  };

  const clipToScreen: (v: vec4) => vec2 = ([x, y, , w]) =>
    [(x / w + 1) * width * 0.5, (1 - y / w) * height * 0.5] as vec2;

  const clipToLocal = (v: vec4) => {
    const transform = mat4.multiply(matrix, projection, modelView);
    const inverse = mat4.invert(matrix, transform);
    const [x, y, z, w] = vec4.transformMat4(vec4.create(), v, inverse);
    return [x / w, y / w, z / w] as vec3;
  };

  const localToClip = ([x, y, z]: vec3) => {
    const transform = mat4.multiply(matrix, projection, modelView);
    return vec4.transformMat4(vec4.create(), [x, y, z, 1], transform);
  };

  const localToWorld = ([x, y, z]: vec3) => {
    const [cx, cy, cz] = camera;
    return [x + cx, y + cy, z + cz] as vec3;
  };

  const worldToLocal = ([x, y, z]: vec3) => {
    const [cx, cy, cz] = camera;
    return [x - cx, y - cy, z - cz] as vec3;
  };

  return {
    screenToClip,
    clipToScreen,
    clipToLocal,
    localToClip,
    localToWorld,
    worldToLocal,
  };
};
