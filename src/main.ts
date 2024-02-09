import { quat, vec2, vec3 } from "gl-matrix";

import { range } from "./common";
import { indices, vertices } from "./k1000";
import { createWorld } from "./world";
import { createMouseControl } from "./control";

/**
 * TODO:
 * always render pick?
 * drag example
 * mercator elevation
 * smooth transition
 * subdivide const
 * labels
 */

export const imageryUrl =
  "http://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}";
export const terrainUrl =
  "https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoiZ3JhaGFtZ2liYm9ucyIsImEiOiJja3Qxb3Q5bXQwMHB2MnBwZzVyNzgyMnZ6In0.4qLjlbLm6ASuJ5v5gN6FHQ";

let position: vec3 = [-121, 38, 10000];

const canvas = document.querySelector("canvas") as HTMLCanvasElement;

const world = createWorld(canvas);
const control = createMouseControl(canvas, world);

world.view = {
  ...world.view,
  distance: 100000,
  target: position,
};

const n = 100;
world.addLine({
  points: range(0, n + 1).map<vec3>(i => {
    const a = ((i / n) * Math.PI * 2) / 10;
    return [-121 + 1 * Math.cos(a * 5), 38 + 1 * Math.sin(a), 400];
  }),
  color: [0.1, 0.1, 1, 0.5],
  width: 100,
  minWidthPixels: 4,
});

let dragging: vec3 | undefined;
world.addTerrain({
  terrainUrl,
  imageryUrl,
});

const mesh = world.addMesh({
  vertices,
  indices,
  position,
  size: 1 / 1000,
  minSizePixels: 0.2,
});

world.onMouseDown(({ position, layer }) => {
  console.log("MouseDown", layer);
  if (layer === mesh) {
    control.enabled = false;
    mesh.pickable = false;
    dragging = vec3.sub(vec3.create(), position, mesh.position);
  }
});

world.onMouseMove(({ position }) => {
  if (dragging) mesh.position = vec3.sub(vec3.create(), position, dragging);
});

world.onMouseUp(() => {
  dragging = undefined;
  control.enabled = true;
  mesh.pickable = true;
});

const stem = world.addLine({
  color: [1, 0, 0, 0.5],
  width: 3,
  minWidthPixels: 1,
  maxWidthPixels: 3,
});

let lastTime = 0;
const frame = (time: number) => {
  const delta = time - lastTime;
  lastTime = time;

  const [lng = 0, lat = 0, alt = 0] = position;
  const newLat = lat + 0.00000001 * delta;
  position = [lng, newLat, alt];
  stem.points = [
    [lng, newLat, 0],
    [lng, newLat, alt],
  ];
  const roll = time / 100;
  const pitch = Math.sin(time * 0.001) * 5;
  mesh.orientation = quat.fromEuler(quat.create(), pitch, roll, 0);
  requestAnimationFrame(frame);
};

requestAnimationFrame(frame);
