import type { Programs } from "./programs";
import { createPrograms } from "./programs";

export type Context = {
  gl: WebGL2RenderingContext;
  programs: Programs;
};

export const createContext = (canvas: HTMLCanvasElement) => {
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("No WebGL2");

  if (gl.isContextLost()) throw new Error("Context lost");

  const loseContextExtension = gl.getExtension("WEBGL_lose_context");

  window.addEventListener("keydown", async event => {
    if (event.key === "l") {
      loseContextExtension?.loseContext();
      await new Promise(resolve => setTimeout(resolve, 1000));
      loseContextExtension?.restoreContext();
    }
  });

  const programs = createPrograms(gl);

  const { dispose } = programs;

  return { gl, programs, dispose };
};
