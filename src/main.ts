import { quat, vec3 } from "gl-matrix";
import { range } from "./common";
import { circumference } from "./constants";
import { Line } from "./line";
import { createWorld } from "./world";

/**
 * TODO:
 * mesh
 * Zoom limits?
 * yaw pitch roll camera
 * object class
 * pick
 * mercator elevation
 * smooth transition
 * subdivide const
 */

const world = createWorld(
  document.querySelector("canvas") as HTMLCanvasElement
);

world.anchor = {
  screen: [400, 400],
  world: [-121, 38, 0],
  distance: 40000,
};

const n = 100;
world.addLine({
  points: range(0, n + 1).map<vec3>((i) => {
    const a = ((i / n) * Math.PI * 2) / 10;
    return [-121 + 1 * Math.cos(a * 5), 38 + 1 * Math.sin(a), 400];
  }),
  color: [0.1, 0.1, 1, 0.5],
  width: 1000,
  minWidthPixels: 4,
  maxWidthPixels: 20,
});

const mesh = world.addMesh({
  vertices: [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
  ],
  indices: [[0, 1, 2]],
  position: [-121, 38, 1000],
  color: [1, 0, 0, 1],
  size: 1000,
  maxSizePixels: 100,
  minSizePixels: 10,
});

const frame = (time: number) => {
  mesh.orientation = quat.fromEuler(quat.create(), 0, time / 10, 0);
  requestAnimationFrame(frame);
};

requestAnimationFrame(frame);
