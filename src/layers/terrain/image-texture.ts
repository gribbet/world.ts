import { loadImage } from "../../image-load";
import { createTexture } from "./texture";

export interface ImageTexture {
  loaded: boolean;
  use: () => void;
  destroy: () => void;
}

export const createImageTexture: (_: {
  gl: WebGL2RenderingContext;
  url: string;
  onLoad?: () => void;
}) => ImageTexture = ({ gl, url, onLoad }) => {
  const texture = createTexture(gl);

  const imageLoad = loadImage({
    url,
    onLoad: (image) => {
      texture.use();
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

  const use = () => texture.use();

  const destroy = () => {
    imageLoad.cancel();
    texture.destroy();
  };

  return {
    get loaded() {
      return imageLoad.loaded;
    },
    use,
    destroy,
  };
};
