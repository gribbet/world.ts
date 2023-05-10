import { vec3 } from "gl-matrix";
import * as LruCache from "lru-cache";
import { createImageTexture, ImageTexture } from "./image-texture";
import { Texture } from "./texture";
import { createTileIndexCache } from "./tile-index-cache";

export type TileCache = {
  get: (xyz: vec3) => Texture | undefined;
  destroy: () => void;
};

export const createTileCache: (_: {
  gl: WebGL2RenderingContext;
  urlPattern: string;
  onLoad?: () => void;
}) => TileCache = ({ gl, urlPattern, onLoad }) => {
  const tiles = createTileIndexCache<ImageTexture>({
    max: 10000,
    dispose: (tile) => tile.destroy(),
  });
  const loading = createTileIndexCache<true>({
    max: 10000,
    ttl: 2000,
    dispose: (_, xyz) => {
      const cached = tiles.get(xyz);
      if (cached && !cached.loaded) {
        console.log("Cancel", xyz);
        tiles.delete(xyz);
      }
    },
  });

  const get: (xyz: vec3) => Texture | undefined = (xyz) => {
    const cached = tiles.get(xyz);
    if (cached) {
      if (cached.loaded) {
        loading.delete(xyz);
        return cached;
      }
      loading.set(xyz, true);
    } else {
      const [x, y, z] = xyz;
      const url = urlPattern
        .replace("{x}", `${x}`)
        .replace("{y}", `${y}`)
        .replace("{z}", `${z}`);
      const texture = createImageTexture({
        gl,
        url,
        onLoad: () => {
          loading.delete(xyz);
          onLoad?.();
        },
      });
      tiles.set(xyz, texture);
      loading.set(xyz, true);
    }
  };

  const interval = setInterval(() => loading.purgeStale(), 200);

  const destroy = () => {
    clearInterval(interval);
    tiles.clear();
  };

  return { get, destroy };
};
