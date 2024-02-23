import { Program, createProgram } from "./program";

export type Programs = {
  get: (_: { vertexSource: string; fragmentSource: string }) => Program;
  dispose: () => void;
};

export const createPrograms = (gl: WebGL2RenderingContext) => {
  const programs = new Map<string, Program>();

  const get = ({
    vertexSource,
    fragmentSource,
  }: {
    vertexSource: string;
    fragmentSource: string;
  }) => {
    const key = vertexSource + fragmentSource;
    const cached = programs.get(key);
    if (cached) return cached;
    const program = createProgram({ gl, vertexSource, fragmentSource });
    programs.set(key, program);
    return program;
  };

  const dispose = () => [...programs.values()].forEach(_ => _.dispose());

  return {
    get,
    dispose,
  } satisfies Programs;
};
