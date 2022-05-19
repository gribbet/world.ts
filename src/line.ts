import { vec3, vec4 } from "gl-matrix";

export interface Line {
  points: vec3[];
  color: vec4;
  thickness: number;
}
