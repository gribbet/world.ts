import type { ImageTexture } from "../terrain/image-texture";
import { createImageTexture } from "../terrain/image-texture";

type Entry = {
  count: number;
  texture: ImageTexture;
};

export const createImageTextureCache = () => {
  const caches = new Map<WebGL2RenderingContext, Map<string, Entry>>();

  const getCache = (gl: WebGL2RenderingContext) => {
    const cache = caches.get(gl);
    if (cache) return cache;
    else {
      const cache = new Map<string, Entry>();
      caches.set(gl, cache);
      return cache;
    }
  };

  const get = ({ gl, url }: { gl: WebGL2RenderingContext; url: string }) => {
    const cache = getCache(gl);

    const cached = cache.get(url);
    if (cached) {
      cached.count++;
      return cached.texture;
    }

    const texture = createImageTexture({
      gl,
      url,
    });

    const entry: Entry = {
      count: 1,
      texture: {
        get loaded() {
          return texture.loaded;
        },
        get size() {
          return texture.size;
        },
        use: texture.use,
        attach: texture.attach,
        dispose: () => {
          entry.count--;
          if (entry.count > 0) return;
          texture.dispose();
          cache.delete(url);
        },
      },
    };

    cache.set(url, entry);

    return entry.texture;
  };

  const dispose = () => {
    [...caches.values()].forEach(_ => _.clear());
    caches.clear();
  };

  return { get, dispose };
};
