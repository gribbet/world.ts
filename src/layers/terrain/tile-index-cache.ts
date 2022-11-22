import { vec3 } from "gl-matrix";
import * as LRUCache from "lru-cache";

export type TileIndexCache<T> = {
  get: (xyz: vec3) => T | undefined;
  set: (xyz: vec3, value: T) => void;
};

export const createTileIndexCache: <T>(_: {
  max: number;
  ttl?: number;
  dispose?: (value: T) => void;
}) => TileIndexCache<T> = (options) => {
  const cache = new LRUCache<number, any>(options);

  const tileKey = ([x, y, z]: vec3) => {
    let key = y * 2 ** z + x;
    while (--z > 0) {
      key += 4 ** z;
    }
    return key;
  };

  return {
    get: (xyz: vec3) => cache.get(tileKey(xyz)),
    set: (xyz: vec3, value: any) => cache.set(tileKey(xyz), value),
  };
};
