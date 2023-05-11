import { quat, vec3, vec4 } from "gl-matrix";

export type Mesh = {
  vertices: vec3[];
  indices: vec3[];
  position: vec3;
  orientation: quat;
  color: vec4;
};
