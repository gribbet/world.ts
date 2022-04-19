import { vec3 } from "gl-matrix";
import * as LruCache from "lru-cache";
import { imageryUrl, terrainUrl } from "./constants";
import { elevation } from "./elevation";
import { geodetic, tileToMercator } from "./math";

export interface Tiles {
  imagery: (xyz: vec3) => { texture: WebGLTexture; downsample: number };
  terrain: (xyz: vec3) => { texture: WebGLTexture; downsample: number };
  cancelUnused: (f: () => void) => void;
}

export const createTiles: (gl: WebGLRenderingContext) => Tiles = (gl) => {
  const imagery = (xyz: vec3) =>
    downsampled({
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

  const terrain = (xyz: vec3) =>
    downsampled({
      url: terrainUrl,
      xyz,
      downsample: 4,
      onLoad: () => {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      },
    });

  const downsampled: (_: {
    url: string;
    xyz: vec3;
    downsample?: number;
    onLoad?: () => void;
  }) => {
    texture: WebGLTexture;
    downsample: number;
  } = ({ url, xyz, downsample = 0, onLoad }) => {
    const [x, y, z] = xyz;
    for (; downsample <= z; downsample++) {
      const k = Math.pow(2, downsample);
      const { loaded, texture } = get({
        url,
        xyz: [Math.floor(x / k), Math.floor(y / k), z - downsample],
        onLoad,
      });
      if (loaded) return { texture, downsample };
    }
    const { texture } = get({
      url,
      xyz: [0, 0, 0],
      onLoad,
    });
    return { texture, downsample: z };
  };

  interface Tile {
    texture: WebGLTexture;
    loaded: boolean;
    dispose: () => void;
  }

  const tiles = new LruCache<string, Tile>({
    max: 1000,
    dispose: (tile) => {
      tile.dispose();
    },
  });

  const used = new Set<string>();
  const get: (_: { url: string; xyz: vec3; onLoad?: () => void }) => Tile = ({
    url,
    xyz,
    onLoad,
  }) => {
    const key = JSON.stringify({ url, xyz });
    used.add(key);
    const cached = tiles.get(key);
    if (cached) return cached;

    const tile = load({ url, xyz, onLoad });
    tiles.set(key, tile);
    return tile;
  };

  const load: (_: { url: string; xyz: vec3; onLoad?: () => void }) => Tile = ({
    url,
    xyz: [x, y, z],
    onLoad,
  }) => {
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

  return { imagery, terrain, cancelUnused };
};

export interface ImageLoad {
  image: HTMLImageElement;
  loaded: boolean;
  cancel: () => void;
}

export const loadImage: (_: {
  url: string;
  onLoad?: (image: HTMLImageElement) => void;
}) => ImageLoad = ({ url, onLoad }) => {
  let loaded = false;

  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = async () => {
    loaded = true;
    onLoad?.(image);
  };
  image.src = url;

  const cancel = () => {
    if (!loaded) {
      console.log("Cancel");
      image.src = "";
    }
  };

  return {
    image,
    get loaded() {
      return loaded;
    },
    cancel,
  };
};

let tileShapes = new LruCache<string, vec3[]>({
  max: 10000,
});

let tileShapesCalculations = new LruCache<string, Promise<vec3[]>>({
  max: 100,
});

export const getTileShape: (xyz: vec3) => vec3[] | undefined = ([x, y, z]) => {
  const key = `${z}-${x}-${y}`;
  const cached = tileShapes.get(key);
  if (cached) return cached;

  if (tileShapesCalculations.get(key)) return undefined;

  calculateTileShape([x, y, z]).then((_) => {
    tileShapes.set(key, _);
    tileShapesCalculations.delete(key);
  });

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
