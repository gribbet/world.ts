import { createImageLoad } from "../../image-load";
import { createTexture } from "./texture";

export type ImageTexture = {
  loaded: boolean;
  size: [number, number];
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
  let size: [number, number] = [1, 1];

  const texture = createTexture(gl);

  const imageLoad = createImageLoad({
    url,
    onLoad: _ => {
      if (!_) return;
      const { width, height } = _;
      size = [width, height];
      texture.use();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, _);
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        gl.LINEAR_MIPMAP_LINEAR,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.generateMipmap(gl.TEXTURE_2D);
      onLoad?.(_);
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
    get size() {
      return size;
    },
    use,
    attach,
    dispose,
  } satisfies ImageTexture;
};
