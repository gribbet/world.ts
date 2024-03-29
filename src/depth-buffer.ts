import type { vec2 } from "gl-matrix";

export type DepthBuffer = {
  use: () => void;
  resize: (size: vec2) => void;
  read: (pixel: vec2) => readonly [z: number, n: number];
  dispose: () => void;
};

export const createDepthBuffer = (gl: WebGL2RenderingContext) => {
  const targetTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, targetTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const renderbuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);

  const framebuffer = gl.createFramebuffer();

  const use = () => gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

  use();
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    targetTexture,
    0,
  );
  gl.framebufferRenderbuffer(
    gl.FRAMEBUFFER,
    gl.DEPTH_ATTACHMENT,
    gl.RENDERBUFFER,
    renderbuffer,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  let height = 0;
  const resize = ([width = 0, _height = 0]: vec2) => {
    height = _height;
    gl.bindTexture(gl.TEXTURE_2D, targetTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );

    gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
    gl.renderbufferStorage(
      gl.RENDERBUFFER,
      gl.DEPTH_COMPONENT16,
      width,
      height,
    );
  };

  const buffer = new Uint8Array(4);
  const read = ([x = 0, y = 0]: vec2) => {
    use();
    gl.readPixels(x, height - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const [r = 0, g = 0, b = 0, a = 0] = buffer;
    const zo = (r * 256 + g) / (256 * 256 - 1);
    const z = 2 * zo - 1;
    const n = b * 256 + a;

    return [z, n] as const;
  };

  const dispose = () => {
    gl.deleteTexture(targetTexture);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteRenderbuffer(renderbuffer);
  };

  return {
    use,
    resize,
    read,
    dispose,
  } satisfies DepthBuffer;
};
