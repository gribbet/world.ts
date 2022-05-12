import { vec3 } from "gl-matrix";
import * as LruCache from "lru-cache";
import { imageryUrl, terrainUrl } from "./constants";
import { loadImage } from "./image-load";

export interface DownsampledTile {
  texture: WebGLTexture;
  downsample: number;
}

export interface Tiles {
  imagery: (xyz: vec3) => DownsampledTile;
  terrain: (xyz: vec3) => DownsampledTile;
  cancelUnused: (f: () => void) => void;
}

export const createTiles: (gl: WebGLRenderingContext) => Tiles = (gl) => {
  const imageryCache = createTileCache({
    gl,
    url: imageryUrl,
    onLoad: () => {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    },
  });

  const terrainCache = createTileCache({
    gl,
    url: terrainUrl,
    onLoad: () => {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    },
  });

  const imageryDownsampler = createDownsampler(imageryCache);

  const terrainDownsampler = createDownsampler(terrainCache);

  const empty = gl.createTexture();
  if (!empty) throw new Error("Texture creation failed");

  const imagery = (xyz: vec3) =>
    imageryDownsampler(xyz) || { texture: empty, downsample: 0 };

  const terrain = (xyz: vec3) =>
    terrainDownsampler(xyz, 3) || { texture: empty, downsample: 0 };

  const cancelUnused = (f: () => void) =>
    imageryCache.cancelUnused(() => terrainCache.cancelUnused(f));

  return { imagery, terrain, cancelUnused };
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
  get: (xyz: vec3) => WebGLTexture | undefined;
  cancelUnused: (f: () => void) => void;
}

const createTileCache: (_: {
  gl: WebGLRenderingContext;
  url: string;
  onLoad?: () => void;
}) => TileCache = ({ gl, url, onLoad }) => {
  interface TileCacheEntry {
    texture: WebGLTexture;
    loaded: boolean;
    dispose: () => void;
  }

  const tiles = new LruCache<number, TileCacheEntry>({
    max: 1000,
    dispose: (tile) => {
      tile.dispose();
    },
  });

  const used = new Set<number>();
  const get: (xyz: vec3) => WebGLTexture | undefined = (xyz) => {
    const [x, y, z] = xyz;
    const key = 4 ** z + y * 2 ** z + x;
    used.add(key);
    const cached = tiles.get(key);
    if (cached) {
      const { loaded, texture } = cached;
      if (loaded) return texture;
    } else {
      const entry = load({ url, xyz });
      tiles.set(key, entry);
    }
  };

  const load: (_: {
    url: string;
    xyz: vec3;
    onLoad?: () => void;
  }) => TileCacheEntry = ({ url, xyz: [x, y, z] }) => {
    const texture = gl.createTexture();
    if (!texture) throw new Error("Texture creation failed");

    url = url
      .replace("{x}", `${x}`)
      .replace("{y}", `${y}`)
      .replace("{z}", `${z}`);

    const imageLoad = loadImage({
      url,
      onLoad: (image) => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          image
        );
        onLoad?.();
      },
    });

    const dispose = () => {
      imageLoad.cancel();
      gl.deleteTexture(texture);
    };

    return {
      texture,
      get loaded() {
        return imageLoad.loaded;
      },
      dispose,
    };
  };

  const cancelUnused = (f: () => void) => {
    used.clear();
    f();
    [...tiles.entries()]
      .filter(([_]) => !used.has(_))
      .filter(([, _]) => !_.loaded)
      .forEach(([_]) => tiles.delete(_));
  };

  return { get, cancelUnused };
};
