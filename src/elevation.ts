import { vec2, vec3 } from "gl-matrix";
import * as LRUCache from "lru-cache";
import { TileCache } from "./layers/terrain/tile-cache";
import { createTileDownsampler } from "./layers/terrain/tile-downsampler";
import { createTileIndexCache } from "./layers/terrain/tile-index-cache";
import { mercator } from "./math";

const defaultZ = 10;
const size = 256;

export type Elevation = {
  get: ([lng, lat]: vec2, z?: number) => number;
  destroy: () => void;
};

export const createElevation: (_: {
  gl: WebGL2RenderingContext;
  terrainCache: TileCache;
}) => Elevation = ({ gl, terrainCache }) => {
  const tileCache = createTileIndexCache<Uint8Array>({
    max: 1000,
  });

  const downsampler = createTileDownsampler(terrainCache);

  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) throw new Error("Framebuffer creation failed");

  const downsampleBuffer = ([x, y, z]: vec3) => {
    const tile = downsampler.get([x, y, z]);
    if (!tile) return undefined;
    const { texture, downsample } = tile;
    const k = 2 ** downsample;
    const xyz: vec3 = [Math.floor(x / k), Math.floor(y / k), z - downsample];
    const cached = tileCache.get(xyz);
    if (cached) return { buffer: cached, downsample };

    const buffer = new Uint8Array(4 * size * size);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    texture.attach();
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    console.log("Read", xyz);

    tileCache.set(xyz, buffer);
    return { buffer, downsample };
  };

  const get = ([lng, lat]: vec2, z = defaultZ) => {
    const k = 2 ** z;
    const p = mercator([lng, lat, 0]).map((_) => _ * k);
    const [x, y] = p.map((_) => Math.floor(_ % k));
    let [px, py] = p.map((_) => _ % 1);
    const downsampled = downsampleBuffer([x, y, z]);
    if (!downsampled) return 0;
    const { buffer, downsample } = downsampled;
    const k2 = 2 ** downsample;
    [px, py] = [((x % k2) + px) / k2, ((y % k2) + py) / k2];

    const q = 4 * size * Math.floor(py * size) + 4 * Math.floor(px * size);
    const [r, g, b] = buffer.slice(q, q + 4);

    const value = (r * 65536 + g * 256 + b) / 10 - 10000;

    return value;
  };

  const destroy = () => {
    gl.deleteFramebuffer(framebuffer);
  };

  return { get, destroy };
};
