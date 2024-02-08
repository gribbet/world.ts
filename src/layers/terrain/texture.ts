export type Texture = {
  use: () => void;
  attach: () => void;
  destroy: () => void;
};

export const createTexture = (gl: WebGL2RenderingContext) => {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Texture creation failed");

  const use = () => gl.bindTexture(gl.TEXTURE_2D, texture);

  const attach = () => {
    use();
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0
    );
  };

  const destroy = () => gl.deleteTexture(texture);

  return { use, attach, destroy } satisfies Texture;
};
