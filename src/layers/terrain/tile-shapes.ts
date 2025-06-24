import { vec3 } from "gl-matrix";

import type { Elevation } from "../../elevation";
import { geodetic, mercator, tileToMercator } from "../../math";
import { createTileIndexCache } from "./tile-index-cache";

export type TileShapes = {
  get: (xyz: vec3) => vec3[];
};

export const createTileShapes = (elevation: Elevation) => {
  const cache = createTileIndexCache<vec3[]>({
    maxSize: 10000,
    maxAge: 1000,
  });

  const corners = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const get = (xyz: vec3) => {
    const cached = cache.get(xyz);
    if (cached) return cached;

    const [x = 0, y = 0, z = 0] = xyz;
    const elevationZ = Math.max(z - 5, 0);
    const result = new Array<vec3>(4);
    const t = vec3.create();
    for (let i = 0; i < corners.length; i++) {
      const [u = 0, v = 0] = corners[i] ?? [];
      const [lng = 0, lat = 0] = geodetic(
        tileToMercator([x + u, y + v, z], t),
        t,
      );
      result[i] = mercator([lng, lat, elevation.get([lng, lat], elevationZ)]);
    }
    cache.set(xyz, result);
    return result;
  };

  return { get } satisfies TileShapes;
};
