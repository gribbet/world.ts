import type { Programs } from "./programs";
import { createPrograms } from "./programs";

export type Context = {
  gl: WebGL2RenderingContext;
  programs: Programs;
};

export const createContext = (canvas: HTMLCanvasElement) => {
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("No WebGL2");

  const programs = createPrograms(gl);

  const { dispose } = programs;

  return { gl, programs, dispose };
};
