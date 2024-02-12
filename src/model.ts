import type { vec2, vec3 } from "gl-matrix";

export type Orientation = [pitch: number, roll: number, yaw: number];

export type View = {
  target: vec3;
  offset: vec2;
  screen: vec2;
  distance: number;
  orientation: Orientation;
  fieldOfView?: number;
};
