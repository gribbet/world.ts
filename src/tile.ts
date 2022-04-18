import { vec2, vec3 } from "gl-matrix";
import * as LruCache from "lru-cache";
import { imageryUrl, terrainUrl } from "./constants";
import { elevation } from "./elevation";
import { geodetic, tileToMercator } from "./math";

interface Tile {
  imagery: WebGLTexture;
  terrain: WebGLTexture;
  loaded: boolean;
  dispose: () => void;
}

let tiles = new LruCache<string, Tile>({
  max: 1000,
  dispose: (tile) => {
    tile.dispose();
  },
});

export const getTile = (gl: WebGLRenderingContext, xyz: vec3) => {
  const [x, y, z] = xyz;
  const key = `${z}-${x}-${y}`;
  const cached = tiles.get(key);
  if (cached) return cached;

  const imagery = loadTileTexture({
    gl,
    url: imageryUrl,
    xyz,
    onLoad: () => {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    },
  });
  const terrain = loadTileTexture({
    gl,
    url: terrainUrl,
    xyz,
    subdivide: 4,
    onLoad: () => {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    },
  });

  const dispose = () => {
    imagery.dispose();
    terrain.dispose();
  };

  const tile: Tile = {
    imagery: imagery.texture,
    terrain: terrain.texture,
    get loaded() {
      return (
        imagery.loaded &&
        (terrain.loaded || terrain.error) &&
        !!getTileShape(xyz)
      );
    },
    dispose,
  };

  tiles.set(key, tile);

  return tile;
};

export const cancelUnloadedTiles = (current: vec3[]) => {
  const set = new Set([...current.map(([x, y, z]) => `${z}-${x}-${y}`)]);
  [...tiles.entries()]
    .filter(([key]) => !set.has(key))
    .filter(([, tile]) => !tile.loaded)
    .forEach(([key]) => tiles.delete(key));
};

interface TileTexture {
  texture: WebGLTexture;
  loaded: boolean;
  error: boolean;
  dispose: () => void;
}

const loadTileTexture: (_: {
  gl: WebGLRenderingContext;
  url: string;
  xyz: vec3;
  subdivide?: number;
  onLoad?: () => void;
}) => TileTexture = ({ gl, url, xyz, subdivide = 0, onLoad }) => {
  const [x0, y0, z0] = xyz;
  subdivide = Math.min(subdivide, z0);
  const k = Math.pow(2, subdivide);
  const [x, y, z] = [Math.floor(x0 / k), Math.floor(y0 / k), z0 - subdivide];
  const [u, v, w] = [x0 % k, y0 % k, subdivide];

  const texture = gl.createTexture();
  if (!texture) throw new Error("Texture creation failed");

  url = url
    .replace("{x}", `${x}`)
    .replace("{y}", `${y}`)
    .replace("{z}", `${z}`);

  const imageLoad = loadImage({
    url,
    onLoad: async () => {
      const { image } = imageLoad;
      const k = image.width * Math.pow(2, -w);
      const cropped = await createImageBitmap(image, k * u, k * v, k, k);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        cropped
      );
      onLoad?.();
    },
  });

  const dispose = () => {
    imageLoad.cancel();
    gl.deleteTexture(texture);
  };

  const { cancel } = imageLoad;

  return {
    texture,
    get loaded() {
      return imageLoad.loaded;
    },
    get error() {
      return imageLoad.error;
    },
    dispose,
    cancel,
  };
};

let tileShapes = new LruCache<string, vec3[]>({
  max: 1000,
});

let tileShapesCalculations = new LruCache<string, Promise<vec3[]>>({
  max: 1000,
});

export const getTileShape: (xyz: vec3) => vec3[] | undefined = ([x, y, z]) => {
  const key = `${z}-${x}-${y}`;
  const cached = tileShapes.get(key);
  if (cached) return cached;

  if (tileShapesCalculations.get(key)) return undefined;

  const result = calculateTileShape([x, y, z]).then((_) =>
    tileShapes.set(key, _)
  );

  return undefined;
};

const calculateTileShape: (xyz: vec3) => Promise<vec3[]> = ([x, y, z]) => {
  return Promise.all(
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
      .map<vec3>(([u, v]) => [x + u, y + v, z])
      .map(tileToMercator)
      .map(geodetic)
      .map<Promise<vec3>>(async ([lng, lat]) => [
        lng,
        lat,
        await elevation([lng, lat]),
      ])
  );
};

export interface ImageLoad {
  image: HTMLImageElement;
  loaded: boolean;
  error: boolean;
  cancel: () => void;
}

export const loadImage: (_: {
  url: string;
  onLoad?: () => void;
}) => ImageLoad = ({ url, onLoad }) => {
  let loaded = false;
  let error = false;

  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = async () => {
    loaded = true;
    onLoad?.();
  };
  image.onerror = (_) => {
    error = true;
  };
  image.src = url;

  const cancel = () => {
    if (!loaded) image.src = "";
  };

  return {
    image,
    get loaded() {
      return loaded;
    },
    get error() {
      return error;
    },
    cancel,
  };
};
