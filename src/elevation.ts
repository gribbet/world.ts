import * as LRUCache from "lru-cache";

const z = 13;

const terrainUrl =
  "https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoiZ3JhaGFtZ2liYm9ucyIsImEiOiJja3Qxb3Q5bXQwMHB2MnBwZzVyNzgyMnZ6In0.4qLjlbLm6ASuJ5v5gN6FHQ";

const cache = new LRUCache<number, number>({
  max: 10000,
});

const calculateCache = new LRUCache<number, Promise<number>>({
  max: 1000,
});

const key = ([lng, lat]: [number, number]) => lng * 180 + lat; // TODO: Fix key

export function elevation([lng, lat]: [number, number]): number | undefined {
  const cached = cache.get(key([lng, lat]));
  if (cached !== undefined) return cached;
  getElevation([lng, lat]).then((_) => cache.set(key([lng, lat]), _));
  return undefined;
}

async function getElevation([lng, lat]: [number, number]): Promise<number> {
  const p = mercator([lng, lat]).map((_) => _ * Math.pow(2, z));
  const [x, y] = p.map((_) => Math.floor(_));
  const [px, py] = p.map((_) => _ % 1);
  const cached = calculateCache.get(key([lng, lat]));
  if (cached) return cached;
  const result = tile(x, y, z).then((_) => _.query(px, py));
  calculateCache.set(key([lng, lat]), result);
  return result;
}

interface Tile {
  query(x: number, y: number): number;
}

const tileCache = new LRUCache<string, Promise<Tile>>({
  max: 10000,
});

function tile(x: number, y: number, z: number): Promise<Tile> {
  const key = [x, y, z].join("-");
  const cached = tileCache.get(key);
  if (cached) return cached;
  const result = loadTile(x, y, z);
  tileCache.set(key, result);
  return result;
}

async function loadTile(x: number, y: number, z: number): Promise<Tile> {
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
}

function mercator([lng, lat]: [number, number]) {
  return [
    lng / 360 + 0.5,
    -Math.asinh(Math.tan((lat / 180) * Math.PI)) / (2 * Math.PI) + 0.5,
  ];
}
