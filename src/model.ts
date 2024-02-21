import type { vec2, vec3 } from "gl-matrix";

import type { Layer } from "./layers";
import { circumference } from "./math";

export type View = {
  target: vec3;
  offset: vec2;
  distance: number;
  orientation: vec3;
  fieldOfView: number;
};

export const defaultView: View = {
  target: [0, 0, 0],
  offset: [0, 0],
  distance: circumference,
  orientation: [0, 0, 0],
  fieldOfView: 45,
};

export type Pick = {
  point: vec2;
  position: vec3;
  layer: Layer | undefined;
};
