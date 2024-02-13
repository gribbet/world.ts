import type { vec2, vec3 } from "gl-matrix";

export type View = {
  target: vec3;
  offset: vec2;
  screen: vec2;
  distance: number;
  orientation: vec3;
  fieldOfView: number;
};
