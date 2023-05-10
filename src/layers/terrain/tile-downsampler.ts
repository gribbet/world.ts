import { vec3 } from "gl-matrix";
import { Texture } from "./texture";
import { TileCache } from "./tile-cache";

export type DownsampledTile = {
  texture: Texture;
  downsample: number;
};

export type DownsampleOptions = {
  downsample?: number;
  loadParents?: boolean;
};

export type TileDownsampler = {
  get: (xyz: vec3, options?: DownsampleOptions) => DownsampledTile | undefined;
};

export const createTileDownsampler: (cache: TileCache) => TileDownsampler = (
  cache
) => {
  return {
    get: (xyz, options) => {
      const { downsample, loadParents } = {
        downsample: 0,
        loadParents: false,
        ...options,
      };
      const [x, y, z] = xyz;
      let result: { texture: Texture; downsample: number } | undefined;
      let first = true;
      for (let i = z - downsample; i >= 0; i--) {
        const k = 2 ** i;
        const xyz: vec3 = [Math.floor(x / k), Math.floor(y / k), z - i];
        const texture =
          first || loadParents || cache.has(xyz) ? cache.get(xyz) : undefined;
        if (texture) result = { texture, downsample: i };
        first = false;
      }

      return result;
    },
  };
};
