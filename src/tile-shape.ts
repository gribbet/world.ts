import { vec3 } from "gl-matrix";
import * as LruCache from "lru-cache";
import { elevation } from "./elevation";
import { geodetic, tileToMercator } from "./math";

let tileShapes = new LruCache<string, vec3[]>({
  max: 10000,
});

let tileShapesCalculations = new LruCache<string, Promise<vec3[]>>({
  max: 100,
});

export const tileShape: (xyz: vec3) => vec3[] | undefined = ([x, y, z]) => {
  const key = `${z}-${x}-${y}`;
  const cached = tileShapes.get(key);
  if (cached) return cached;

  if (tileShapesCalculations.get(key)) return undefined;

  calculateTileShape([x, y, z]).then((_) => {
    tileShapes.set(key, _);
    tileShapesCalculations.delete(key);
  });

  return undefined;
};

const calculateTileShape: (xyz: vec3) => Promise<vec3[]> = ([x, y, z]) => {
  return Promise.all(
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
      .map<vec3>(([u, v]) => [x + u, y + v, z])
      .map(tileToMercator)
      .map(geodetic)
      .map<Promise<vec3>>(async ([lng, lat]) => [
        lng,
        lat,
        await elevation([lng, lat]),
      ])
  );
};
