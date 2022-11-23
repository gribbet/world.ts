import { vec3 } from "gl-matrix";
import * as LRUCache from "lru-cache";

export type TileIndexCache<T> = {
  get: (xyz: vec3) => T | undefined;
  set: (xyz: vec3, value: T) => void;
  delete: (xyz: vec3) => void;
  clear: () => void;
  purgeStale: () => void;
};

export const createTileIndexCache: <T>(_: {
  max: number;
  ttl?: number;
  updateAgeOnGet?: boolean;
  dispose?: (value: T) => void;
}) => TileIndexCache<T> = (options) => {
  const cache = new LRUCache<number, any>({ ...options, ttlResolution: 0 });

  const tileKey = ([x, y, z]: vec3) => {
    let key = y * 2 ** z + x;
    while (--z > 0) {
      key += 4 ** z;
    }
    return key;
  };

  return {
    get: (xyz) => cache.get(tileKey(xyz)),
    set: (xyz, value) => cache.set(tileKey(xyz), value),
    delete: (xyz) => cache.delete(tileKey(xyz)),
    clear: () => cache.clear(),
    purgeStale: () => cache.purgeStale(),
  };
};
