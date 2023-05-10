import { vec3 } from "gl-matrix";
import { range } from "./common";
import { circumference } from "./constants";
import { Line } from "./line";
import { createWorld } from "./world";

/**
 * TODO:
 * elevation to use tile cache
 * mesh
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

const line = world.addLine({
  color: [1, 0.9, 0.9, 0.5],
  width: 1000,
  minWidthPixels: 4,
  maxWidthPixels: 20,
});

const frame = (time: number) => {
  const n = 100;
  const points: vec3[] = range(0, n + 1).map<vec3>((i) => {
    const a = ((i / n) * Math.PI * 2) / 10 + time / 1000;
    return [-121 + 1 * Math.cos(a * 5), 38 + 1 * Math.sin(a), 400];
  });
  line.points = points;
  requestAnimationFrame(frame);
};

requestAnimationFrame(frame);
