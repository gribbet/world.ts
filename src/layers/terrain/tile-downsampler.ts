import { vec3 } from "gl-matrix";
import { Texture } from "./texture";
import { TileCache } from "./tile-cache";

export interface DownsampledTile {
  texture: Texture;
  downsample: number;
}

export interface TileDownsampler {
  get: (xyz: vec3, downsample?: number) => DownsampledTile | undefined;
}

export const createTileDownsampler: (cache: TileCache) => TileDownsampler = (
  cache
) => {
  const get = (xyz: vec3, downsample = 0) => {
    const [x, y, z] = xyz;
    for (; downsample <= z; downsample++) {
      const k = 2 ** downsample;
      const xyz: vec3 = [Math.floor(x / k), Math.floor(y / k), z - downsample];
      const texture = cache.get(xyz);
      if (texture) return { texture, downsample };
    }
  };

  return { get };
};
