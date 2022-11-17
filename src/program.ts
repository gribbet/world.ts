import { mat4, vec3 } from "gl-matrix";
import { Buffer } from "./buffer";

export interface Program {
  use: () => void;
  uniform1f: (name: string) => Uniform<number>;
  uniform1i: (name: string) => Uniform<number>;
  uniform3f: (name: string) => Uniform<vec3>;
  uniform3i: (name: string) => Uniform<vec3>;
  uniformMatrix4f: (name: string) => Uniform<mat4>;
  attribute: (name: string, buffer: Buffer) => void;
  destroy: () => void;
}

export interface Uniform<T> {
  set: (value: T) => void;
}

export interface Attribute<T> {
  set: (value: T[]) => void;
}

export const createProgram: (_: {
  gl: WebGL2RenderingContext;
  vertexSource: string;
  fragmentSource: string;
}) => Program = ({ gl, vertexSource, fragmentSource }) => {
  const program = gl.createProgram();
  if (!program) throw new Error("Program creation failed");

  const vertexShader = compileShader(
    gl,
    gl.createShader(gl.VERTEX_SHADER),
    vertexSource
  );
  const fragmentShader = compileShader(
    gl,
    gl.createShader(gl.FRAGMENT_SHADER),
    fragmentSource
  );

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);

  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Link failure", gl.getProgramInfoLog(program));
    throw new Error("Link failure");
  }

  const use = () => gl.useProgram(program);

  const uniform = (name: string) => {
    const location = gl.getUniformLocation(program, name);
    if (!location) throw new Error(`Missing uniform: ${name}`);
    return location;
  };

  const uniform1f = (name: string) => {
    const location = uniform(name);
    let cached: number | undefined;
    const set = (value: number) => {
      if (value === cached) return;
      gl.uniform1f(location, value);
      cached = value;
    };
    return { set };
  };

  const uniform1i = (name: string) => {
    const location = uniform(name);
    let cached: number | undefined;
    const set = (value: number) => {
      if (value === cached) return;
      gl.uniform1i(location, value);
      cached = value;
    };
    return { set };
  };

  const uniform3f = (name: string) => {
    const location = uniform(name);
    let cached: vec3 | undefined;
    const set = (value: vec3) => {
      if (value === cached) return;
      const [x, y, z] = value;
      gl.uniform3f(location, x, y, z);
      cached = value;
    };
    return { set };
  };

  const uniform3i = (name: string) => {
    const location = uniform(name);
    let cached: vec3 | undefined;
    const set = (value: vec3) => {
      if (value === cached) return;
      const [x, y, z] = value;
      gl.uniform3i(location, x, y, z);
      cached = value;
    };
    return { set };
  };

  const uniformMatrix4f = (name: string) => {
    const location = uniform(name);
    let cached: mat4 | undefined;
    const set = (value: mat4) => {
      if (value === cached) return;
      gl.uniformMatrix4fv(location, false, value);
      cached = value;
    };
    return { set };
  };

  const attribute = (name: string, buffer: Buffer) => {
    const location = gl.getAttribLocation(program, name);
    if (location === -1) throw new Error(`Missing attribute: ${location}`);
    buffer.use();
    gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(location);
  };

  const destroy = () => {
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
  };

  return {
    use,
    uniform1f,
    uniform1i,
    uniform3f,
    uniform3i,
    uniformMatrix4f,
    attribute,
    destroy,
  };
};

const compileShader = (
  gl: WebGL2RenderingContext,
  shader: WebGLShader | null,
  source: string
) => {
  if (!shader) throw new Error("Shader creation failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Compilation failed", gl.getShaderInfoLog(shader));
    throw new Error("Compilation failure");
  }

  return shader;
};
