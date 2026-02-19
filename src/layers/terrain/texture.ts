export type Texture = {
  use: () => void;
  attach: () => void;
  dispose: () => void;
};

export const createTexture = (gl: WebGL2RenderingContext) => {
  const texture = gl.createTexture();

  const use = () => gl.bindTexture(gl.TEXTURE_2D, texture);

  const attach = () => {
    use();
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
  };

  const dispose = () => gl.deleteTexture(texture);

  return { use, attach, dispose } satisfies Texture;
};
