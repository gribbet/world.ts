import { vec3 } from "gl-matrix";
import * as LRUCache from "lru-cache";
import { Elevation } from "../../elevation";
import { geodetic, mercator, tileToMercator } from "../../math";
import { createTileIndexCache } from "./tile-index-cache";

export type TileShapes = {
  get: (xyz: vec3) => vec3[];
};

export const createTileShapes: (elevation: Elevation) => TileShapes = (
  elevation
) => {
  let cache = createTileIndexCache<vec3[]>({
    max: 10000,
    ttl: 100,
  });

  const corners = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const get: (xyz: vec3) => vec3[] = (xyz) => {
    const cached = cache.get(xyz);
    if (cached) return cached;

    const [x, y, z] = xyz;
    const result = corners
      .map<vec3>(([u, v]) => [x + u, y + v, z])
      .map((_) => tileToMercator(_, _))
      .map((_) => geodetic(_, _))
      .map((_) => {
        const [lng, lat] = _;
        return mercator(vec3.set(_, lng, lat, elevation.get([lng, lat])), _);
      });
    cache.set(xyz, result);
    return result;
  };

  return { get };
};
