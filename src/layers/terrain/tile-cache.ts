import { vec3 } from "gl-matrix";
import * as LruCache from "lru-cache";
import { createImageTexture, ImageTexture } from "./image-texture";
import { Texture } from "./texture";
import { createTileIndexCache } from "./tile-index-cache";

export type TileCache = {
  get: (xyz: vec3) => Texture | undefined;
  has: (xyz: vec3) => boolean;
  destroy: () => void;
};

export const createTileCache: (_: {
  gl: WebGL2RenderingContext;
  urlPattern: string;
  onLoad?: () => void;
}) => TileCache = ({ gl, urlPattern, onLoad }) => {
  const tiles = createTileIndexCache<ImageTexture>({
    max: 1000,
    dispose: (tile) => tile.destroy(),
  });
  const loading = createTileIndexCache<vec3>({
    max: 1000,
    ttl: 200,
    updateAgeOnGet: true,
    dispose: (xyz) => {
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
      if (cached.loaded) return cached;
      loading.get(xyz);
    } else {
      const [x, y, z] = xyz;
      const url = urlPattern
        .replace("{x}", `${x}`)
        .replace("{y}", `${y}`)
        .replace("{z}", `${z}`);
      console.log("Get", xyz);
      const texture = createImageTexture({
        gl,
        url,
        onLoad: () => {
          loading.delete(xyz);
          onLoad?.();
        },
      });
      tiles.set(xyz, texture);
      loading.set(xyz, xyz);
    }
  };

  const has: (xyz: vec3) => boolean = (xyz) =>
    (tiles.has(xyz) && tiles.get(xyz)?.loaded) || false;

  const interval = setInterval(() => loading.purgeStale(), 200);

  const destroy = () => {
    clearInterval(interval);
    tiles.clear();
  };

  return { get, has, destroy };
};
