import { quat, vec3 } from "gl-matrix";
import { range } from "./common";
import { indices, vertices } from "./k1000";
import { createWorld } from "./world";

/**
 * TODO:
 * cleanup radians/degrees
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

let position: vec3 = [-121, 38, 100];

const world = createWorld(
  document.querySelector("canvas") as HTMLCanvasElement
);
//world.draggable = false;
world.view = {
  ...world.view,
  distance: 100000,
  target: position,
};

const n = 100;
world.addLine({
  points: range(0, n + 1).map<vec3>((i) => {
    const a = ((i / n) * Math.PI * 2) / 10;
    return [-121 + 1 * Math.cos(a * 5), 38 + 1 * Math.sin(a), 400];
  }),
  color: [0.1, 0.1, 1, 0.5],
  width: 100,
  minWidthPixels: 4,
});

world.addTerrain({
  terrainUrl,
  imageryUrl,
  onMouseDown: () => console.log("Terrain"),
});

const mesh = world.addMesh({
  vertices,
  indices,
  size: 1 / 1000,
  minSizePixels: 64 / 1000,
  onMouseDown: (target) => {
    console.log("Clicked", target);
  },
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
  mesh.orientation = quat.fromEuler(quat.create(), pitch, roll, 0);
  requestAnimationFrame(frame);
};

requestAnimationFrame(frame);
