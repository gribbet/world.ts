import { vec3 } from "gl-matrix";
import { Elevation } from "../../elevation";
import { geodetic, mercator, tileToMercator } from "../../math";
import { createTileIndexCache } from "./tile-index-cache";

export type TileShapes = {
  get: (xyz: vec3) => vec3[];
};

export const createTileShapes = (elevation: Elevation) => {
  let cache = createTileIndexCache<vec3[]>({
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

    const [x, y, z] = xyz;
    const result = corners
      .map<vec3>(([u, v]) => [x + u, y + v, z])
      .map((_) => tileToMercator(_, _))
      .map((_) => geodetic(_, _))
      .map((_) => {
        const [lng, lat] = _;
        const elevationZ = Math.max(z - 5, 0);
        return mercator(
          vec3.set(_, lng, lat, elevation.get([lng, lat], elevationZ)),
          _
        );
      });
    cache.set(xyz, result);
    return result;
  };

  return { get } satisfies TileShapes;
};
