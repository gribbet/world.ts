import { quat, vec3 } from "gl-matrix";
import { range } from "./common";
import { circumference } from "./constants";
import { Line } from "./line";
import { createWorld } from "./world";
import { indices, vertices } from "./k1000";

/**
 * TODO:
 * useful mesh
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
  vertices,
  indices,
  size: 1 / 1000,
  minSizePixels: 32 / 1000,
});

const stem = world.addLine({
  color: [1, 0, 0, 0.5],
  width: 3,
  minWidthPixels: 3,
});

let position: vec3 = [-121, 38, 10000];

let lastTime = 0;
const frame = (time: number) => {
  const delta = time - lastTime;
  lastTime = time;

  const [lng, lat, alt] = position;
  position = [lng, lat + 0.00001 * delta, alt];
  mesh.position = position;
  stem.points = [
    [lng, lat, 0],
    [lng, lat, alt],
  ];
  mesh.orientation = quat.fromEuler(quat.create(), 0, time / 10, 0);
  requestAnimationFrame(frame);
};

requestAnimationFrame(frame);
