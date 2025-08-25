import { createImageLoad } from "../../image-load";
import { createTexture } from "./texture";

export type ImageTexture = {
  loaded: boolean;
  use: () => void;
  attach: () => void;
  dispose: () => void;
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
      gl.generateMipmap(gl.TEXTURE_2D);
      onLoad?.(image);
    },
  });

  const { use, attach } = texture;

  const dispose = () => {
    imageLoad.cancel();
    texture.dispose();
  };

  return {
    get loaded() {
      return imageLoad.loaded;
    },
    use,
    attach,
    dispose,
  } satisfies ImageTexture;
};
