import { vec3 } from "gl-matrix";
import * as LruCache from "lru-cache";
import { createImageTexture, ImageTexture } from "./image-texture";
import { Texture } from "./texture";

export interface TileCache {
  get: (xyz: vec3) => Texture | undefined;
  cancelUnused: (f: () => void) => void;
  destroy: () => void;
}

export const createTileCache: (_: {
  gl: WebGL2RenderingContext;
  urlPattern: string;
  onLoad?: () => void;
}) => TileCache = ({ gl, urlPattern, onLoad }) => {
  const tiles = new LruCache<number, ImageTexture>({
    max: 1000,
    dispose: (tile) => {
      tile.destroy();
    },
  });

  const tileKey = ([x, y, z]: vec3) => {
    let key = y * 2 ** z + x;
    while (--z > 0) {
      key += 4 ** z;
    }
    return key;
  };

  const used = new Set<number>();
  const get: (xyz: vec3) => Texture | undefined = (xyz) => {
    const [x, y, z] = xyz;
    const key = tileKey(xyz);
    used.add(key);
    const cached = tiles.get(key);
    if (cached) {
      const { loaded } = cached;
      if (loaded) return cached;
    } else {
      const url = urlPattern
        .replace("{x}", `${x}`)
        .replace("{y}", `${y}`)
        .replace("{z}", `${z}`);
      const texture = createImageTexture({ gl, url, onLoad });
      tiles.set(key, texture);
    }
  };

  const cancelUnused = (f: () => void) => {
    used.clear();
    f();
    [...tiles.entries()]
      .filter(([_]) => !used.has(_))
      .filter(([, _]) => !_.loaded)
      .forEach(([_]) => tiles.delete(_));
  };

  const destroy = () => tiles.clear();

  return { get, cancelUnused, destroy };
};
