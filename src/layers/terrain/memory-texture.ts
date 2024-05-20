import { createTexture } from "./texture";

export type MemoryTexture = {
  set: (_: ImageData) => void;
  use: () => void;
  attach: () => void;
  dispose: () => void;
};

export const createImageTexture = (gl: WebGL2RenderingContext) => {
  const texture = createTexture(gl);

  const set = (image: ImageData) => {
    texture.use();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  };

  const { use, attach, dispose } = texture;

  return {
    set,
    use,
    attach,
    dispose,
  } satisfies MemoryTexture;
};
