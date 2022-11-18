import { vec3 } from "gl-matrix";
import * as LruCache from "lru-cache";
import { imageryUrl, terrainUrl } from "../../constants";
import { createImageLoad } from "../../image-load";
import { createImageTexture, ImageTexture } from "./image-texture";
import { createTexture, Texture } from "./texture";

export interface DownsampledTile {
  texture: Texture;
  downsample: number;
}

export interface Tiles {
  imagery: (xyz: vec3) => DownsampledTile;
  terrain: (xyz: vec3) => DownsampledTile;
  cancelUnused: (f: () => void) => void;
  destroy: () => void;
}

export const createTiles: (gl: WebGL2RenderingContext) => Tiles = (gl) => {
  const imageryCache = createTileCache({
    gl,
    urlPattern: imageryUrl,
    onLoad: () => {
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        gl.LINEAR_MIPMAP_LINEAR
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.generateMipmap(gl.TEXTURE_2D);
    },
  });

  const terrainCache = createTileCache({
    gl,
    urlPattern: terrainUrl,
    onLoad: () => {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    },
  });

  const imageryDownsampler = createDownsampler(imageryCache);

  const terrainDownsampler = createDownsampler(terrainCache);

  const empty = createTexture(gl);

  const imagery = (xyz: vec3) =>
    imageryDownsampler(xyz) || { texture: empty, downsample: 0 };

  const terrain = (xyz: vec3) =>
    terrainDownsampler(xyz, 3) || { texture: empty, downsample: 0 };

  const cancelUnused = (f: () => void) =>
    imageryCache.cancelUnused(() => terrainCache.cancelUnused(f));

  const destroy = () => {
    imageryCache.destroy();
    terrainCache.destroy();
  };

  return { imagery, terrain, cancelUnused, destroy };
};

type Downsampler = (
  xyz: vec3,
  downsample?: number
) => DownsampledTile | undefined;

const createDownsampler: (cache: TileCache) => Downsampler =
  (cache) =>
  (xyz, downsample = 0) => {
    const [x, y, z] = xyz;
    for (; downsample <= z; downsample++) {
      const k = 2 ** downsample;
      const xyz: vec3 = [Math.floor(x / k), Math.floor(y / k), z - downsample];
      const texture = cache.get(xyz);
      if (texture) return { texture, downsample };
    }
  };

interface TileCache {
  get: (xyz: vec3) => Texture | undefined;
  cancelUnused: (f: () => void) => void;
  destroy: () => void;
}

const createTileCache: (_: {
  gl: WebGL2RenderingContext;
  urlPattern: string;
  onLoad?: () => void;
}) => TileCache = ({ gl, urlPattern, onLoad }) => {
  const tiles = new LruCache<string, ImageTexture>({
    max: 1000,
    dispose: (tile) => {
      tile.destroy();
    },
  });

  const used = new Set<string>();
  const get: (xyz: vec3) => ImageTexture | undefined = (xyz) => {
    const [x, y, z] = xyz;
    const url = urlPattern
      .replace("{x}", `${x}`)
      .replace("{y}", `${y}`)
      .replace("{z}", `${z}`);
    used.add(url);
    const cached = tiles.get(url);
    if (cached) {
      const { loaded } = cached;
      if (loaded) return cached;
    } else {
      const texture = createImageTexture({ gl, url, onLoad });
      tiles.set(url, texture);
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
