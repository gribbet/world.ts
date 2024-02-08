import type { vec3 } from "gl-matrix";

import type { Texture } from "./texture";
import type { TileCache } from "./tile-cache";

export type DownsampledTile = {
  texture: Texture;
  downsample: number;
};

export type TileDownsampler = {
  get: (xyz: vec3) => DownsampledTile | undefined;
};

export const createTileDownsampler = (
  cache: TileCache,
  initialDownsample = 0,
) =>
  ({
    get: ([x = 0, y = 0, z = 0]) => {
      for (
        let downsample = Math.min(z, initialDownsample);
        downsample <= z;
        downsample++
      ) {
        const k = 2 ** downsample;
        const xyz: vec3 = [
          Math.floor(x / k),
          Math.floor(y / k),
          z - downsample,
        ];
        const texture = cache.get(xyz);
        if (texture) return { texture, downsample };
      }
    },
  }) satisfies TileDownsampler;
