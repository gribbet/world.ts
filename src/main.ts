import { quat, vec3 } from "gl-matrix";
import { range } from "./common";
import { circumference } from "./constants";
import { Line } from "./line";
import { createWorld } from "./world";
import { indices, vertices } from "./k1000";

/**
 * TODO:
 * yaw pitch roll camera
 * object class
 * orthographic
 * pick
 * mercator elevation
 * smooth transition
 * subdivide const
 * offset instead of center?
 * labels
 */

const world = createWorld(
  document.querySelector("canvas") as HTMLCanvasElement
);
world.draggable = false;
world.view = {
  ...world.view,
  distance: 100,
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
  minWidthPixels: 1,
  maxWidthPixels: 3,
});

let position: vec3 = [-121, 38, 100];

let lastTime = 0;
const frame = (time: number) => {
  const delta = time - lastTime;
  lastTime = time;

  const [lng, lat, alt] = position;
  const newLat = lat + 0.00000001 * delta;
  position = [lng, newLat, alt];
  mesh.position = position;
  stem.points = [
    [lng, newLat, 0],
    [lng, newLat, alt],
  ];
  const roll = time / 100;
  const pitch = Math.sin(time * 0.001) * 5;
  world.view = {
    ...world.view,
    target: position,
    orientation: [
      Math.PI / 2 - (pitch / 180) * Math.PI,
      (-roll / 180) * Math.PI,
      0,
    ],
  };
  mesh.orientation = quat.fromEuler(quat.create(), pitch, roll, 0);
  requestAnimationFrame(frame);
};

requestAnimationFrame(frame);
