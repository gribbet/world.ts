export type Texture = {
  use: () => void;
  attach: () => void;
  dispose: () => void;
};

export const createTexture = (gl: WebGL2RenderingContext) => {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Texture creation failed");

  const use = () => gl.bindTexture(gl.TEXTURE_2D, texture);

  // Set reasonable defaults
  use();
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

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
