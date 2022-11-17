export interface Texture {
  use: () => void;
  destroy: () => void;
}

export const createTexture: (gl: WebGL2RenderingContext) => Texture = (gl) => {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Texture creation failed");

  let destroyed = false;

  const use = () => {
    if (destroyed) {
      throw new Error("Test");
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
  };

  const destroy = () => {
    destroyed = true;
    gl.deleteTexture(texture);
  };

  return { use, destroy };
};
