import { vec3 } from "gl-matrix";
import { imageryUrl, terrainUrl } from "../../constants";
import { createTexture } from "./texture";
import { createTileCache } from "./tile-cache";
import { createTileDownsampler, DownsampledTile } from "./tile-downsampler";

export interface Tiles {
  imagery: (xyz: vec3) => DownsampledTile | undefined;
  terrain: (xyz: vec3) => DownsampledTile | undefined;
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

  const imageryDownsampler = createTileDownsampler(imageryCache);

  const terrainDownsampler = createTileDownsampler(terrainCache);

  const imagery = (xyz: vec3) => imageryDownsampler.get(xyz);

  const terrain = (xyz: vec3) => terrainDownsampler.get(xyz, 3);

  const cancelUnused = (f: () => void) =>
    imageryCache.cancelUnused(() => terrainCache.cancelUnused(f));

  const destroy = () => {
    imageryCache.destroy();
    terrainCache.destroy();
  };

  return { imagery, terrain, cancelUnused, destroy };
};
