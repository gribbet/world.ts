import { createImageLoad } from "../../image-load";
import { createTexture } from "./texture";

export type ImageTexture = {
  loaded: boolean;
  use: () => void;
  attach: () => void;
  destroy: () => void;
};

export const createImageTexture = ({
  gl,
  url,
  onLoad,
}: {
  gl: WebGL2RenderingContext;
  url: string;
  onLoad?: (_: ImageBitmap) => void;
}) => {
  const texture = createTexture(gl);

  const imageLoad = createImageLoad({
    url,
    onLoad: image => {
      if (!image) return;
      texture.use();
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image,
      );
      onLoad?.(image);
    },
  });

  const { use, attach } = texture;

  const destroy = () => {
    imageLoad.cancel();
    texture.destroy();
  };

  return {
    get loaded() {
      return imageLoad.loaded;
    },
    use,
    attach,
    destroy,
  } satisfies ImageTexture;
};
