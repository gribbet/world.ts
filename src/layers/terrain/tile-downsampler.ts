import { vec3 } from "gl-matrix";
import { Texture } from "./texture";
import { TileCache } from "./tile-cache";

export type DownsampledTile = {
  texture: Texture;
  downsample: number;
};

export type TileDownsampler = {
  get: (xyz: vec3) => DownsampledTile | undefined;
};

export const createTileDownsampler: (
  cache: TileCache,
  initialDownsample?: number
) => TileDownsampler = (cache, initialDownsample = 0) => {
  return {
    get: (xyz) => {
      const [x, y, z] = xyz;
      for (let downsample = initialDownsample; downsample <= z; downsample++) {
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
  };
};
