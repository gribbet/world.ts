import * as LRUCache from "lru-cache";
import { terrainUrl } from "./constants";
import { mercator } from "./math";

const z = 13;

const cache = new LRUCache<string, Promise<number>>({
  max: 1000,
});

export const elevation: ([lng, lat]: [number, number]) => Promise<number> = ([
  lng,
  lat,
]) => {
  const p = mercator([lng, lat, 0]).map((_) => _ * Math.pow(2, z));
  const [x, y] = p.map((_) => Math.floor(_));
  const [px, py] = p.map((_) => _ % 1);
  const key = `${lng}-${lat}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const result = tile(x, y, z).then((_) => _.query(px, py));
  cache.set(key, result);
  return result;
};

interface Tile {
  query(x: number, y: number): number;
}

const tileCache = new LRUCache<string, Promise<Tile>>({
  max: 10000,
});

const tile = (x: number, y: number, z: number) => {
  const key = [x, y, z].join("-");
  const cached = tileCache.get(key);
  if (cached) return cached;
  const result = loadTile(x, y, z);
  tileCache.set(key, result);
  return result;
};

const loadTile = async (x: number, y: number, z: number) => {
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = terrainUrl
        .replace("{x}", x.toString())
        .replace("{y}", y.toString())
        .replace("{z}", z.toString());
    });
    const { width, height } = image;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Context failure");

    context.drawImage(image, 0, 0, width, height);

    const { data } = context.getImageData(0, 0, width, height);

    const query = (x: number, y: number) => {
      let index = (Math.floor(x * width) + Math.floor(y * height) * width) * 4;
      const r = data[index++];
      const g = data[index++];
      const b = data[index++];
      return (r * 65536 + g * 256 + b) / 10 - 10000;
    };

    return { query };
  } catch (error) {
    console.warn("Elevation tile load failure", { x, y, z });
    return { query: () => 0 };
  }
};
