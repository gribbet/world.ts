import { vec3 } from "gl-matrix";

import type { Elevation } from "../../elevation";
import { geodetic, mercator, tileToMercator } from "../../math";
import { createTileIndexCache } from "./tile-index-cache";

export type TileShapes = {
  get: (xyz: vec3) => vec3[];
};

export const createTileShapes = (elevation: Elevation) => {
  const cache = createTileIndexCache<vec3[]>({
    max: 10000,
    ttl: 1000,
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
    const result = corners
      .map<vec3>(([u = 0, v = 0]) => [x + u, y + v, z])
      .map(_ => tileToMercator(_, _))
      .map(_ => geodetic(_, _))
      .map(_ => {
        const [lng = 0, lat = 0] = _;
        const elevationZ = Math.max(z - 5, 0);
        return mercator(
          vec3.set(_, lng, lat, elevation.get([lng, lat], elevationZ)),
          _,
        );
      });
    cache.set(xyz, result);
    return result;
  };

  return { get } satisfies TileShapes;
};
