import type { vec3 } from "gl-matrix";
import LRUCache from "lru-cache";

export type TileIndexCache<T> = {
  get: (xyz: vec3) => T | undefined;
  set: (xyz: vec3, value: T) => void;
  delete: (xyz: vec3) => void;
  clear: () => void;
  purgeStale: () => void;
};

export type CreateTileIndexCacheOptions<T> = {
  max: number;
  ttl?: number;
  dispose?: (value: T, key: vec3) => void;
};

export const createTileIndexCache = <T>(
  options: CreateTileIndexCacheOptions<T>,
) => {
  const cache = new LRUCache<number, T>({
    ...options,
    ttlResolution: 0,
    dispose: (value, key) => options.dispose?.(value, fromKey(key)),
  });

  const toKey = ([x = 0, y = 0, z = 0]: vec3) =>
    y * 2 ** z + x + (4 ** (z + 1) - 1) / 3;
  const fromKey = (key: number) => {
    const z = Math.floor(Math.log(key * 3 + 1) / Math.log(4)) - 1;
    key -= (4 ** (z + 1) - 1) / 3;
    const y = Math.floor(key / 2 ** z);
    const x = key - y * 2 ** z;
    return [x, y, z] satisfies vec3;
  };

  return {
    get: xyz => cache.get(toKey(xyz)),
    set: (xyz, value) => cache.set(toKey(xyz), value as unknown as T),
    delete: xyz => cache.delete(toKey(xyz)),
    clear: () => cache.clear(),
    purgeStale: () => cache.purgeStale(),
  } satisfies TileIndexCache<T>;
};
