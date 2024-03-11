import type { vec3 } from "gl-matrix";

import { tileToMercator } from "../../math";
import type { ImageTexture } from "./image-texture";
import { createImageTexture } from "./image-texture";
import type { Texture } from "./texture";
import { createTileIndexCache } from "./tile-index-cache";

export type TileCache = {
  get: (xyz: vec3) => Texture | undefined;
  dispose: () => void;
};

export const createTileCache = ({
  gl,
  urlPattern,
  onLoad,
}: {
  gl: WebGL2RenderingContext;
  urlPattern: string;
  onLoad?: () => void;
}) => {
  const tiles = createTileIndexCache<ImageTexture>({
    max: 10000,
    dispose: tile => tile.dispose(),
  });
  const loading = createTileIndexCache<true>({
    max: 10000,
    ttl: 200,
    dispose: (_, xyz) => {
      const cached = tiles.get(xyz);
      if (cached && !cached.loaded) {
        console.log("Cancel", xyz);
        tiles.delete(xyz);
      }
    },
  });

  const get: (xyz: vec3) => Texture | undefined = xyz => {
    const cached = tiles.get(xyz);
    if (cached) {
      if (cached.loaded) {
        loading.delete(xyz);
        return cached;
      }
      loading.set(xyz, true);
    } else {
      const [x = 0, y = 0, z = 0] = xyz;
      let url = urlPattern
        .replace("{x}", `${x}`)
        .replace("{y}", `${y}`)
        .replace("{z}", `${z}`);
      if (url.includes("{bbox}")) {
        const [x = 0, _y = 0, z = 0] = xyz;
        const y = 2 ** z - _y - 1;
        const [[minX, minY] = [], [maxX, maxY] = []] = [
          [0, 0],
          [1, 1],
        ]
          .map<vec3>(([u = 0, v = 0]) => [x + u, y + v, z])
          .map(_ => tileToMercator(_, _))
          .map(([x = 0, y = 0]) => [
            (x - 0.5) * 2 * Math.PI * 6378137,
            (y - 0.5) * 2 * Math.PI * 6378137,
          ]);

        url = url.replace("{bbox}", [minX, minY, maxX, maxY].join(","));
      }

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

  const dispose = () => {
    clearInterval(interval);
    tiles.clear();
  };

  return { get, dispose } satisfies TileCache;
};
