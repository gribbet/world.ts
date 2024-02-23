import type { mat4, vec2, vec3, vec4 } from "gl-matrix";

import type { Buffer } from "./buffer";

export type Program = {
  use: () => void;
  uniform1f: (name: string) => Uniform<number>;
  uniform1i: (name: string) => Uniform<number>;
  uniform2f: (name: string) => Uniform<vec2>;
  uniform2i: (name: string) => Uniform<vec2>;
  uniform3f: (name: string) => Uniform<vec3>;
  uniform3i: (name: string) => Uniform<vec3>;
  uniform4f: (name: string) => Uniform<vec4>;
  uniform4i: (name: string) => Uniform<vec4>;
  uniformMatrix4f: (name: string) => Uniform<mat4>;
  attribute2f: (
    name: string,
    buffer: Buffer,
    _?: { stride?: number; offset?: number },
  ) => Attribute;
  attribute3f: (
    name: string,
    buffer: Buffer,
    _?: { stride?: number; offset?: number },
  ) => Attribute;
  attribute3i: (
    name: string,
    buffer: Buffer,
    _?: { stride?: number; offset?: number },
  ) => Attribute;
  dispose: () => void;
};

export type Uniform<T> = {
  set: (value: T) => void;
};

export type Attribute = {
  use: () => void;
};

export const createProgram = ({
  gl,
  vertexSource,
  fragmentSource,
}: {
  gl: WebGL2RenderingContext;
  vertexSource: string;
  fragmentSource: string;
}) => {
  const program = gl.createProgram();
  if (!program) throw new Error("Program creation failed");

  const vertexShader = compileShader(
    gl,
    gl.createShader(gl.VERTEX_SHADER),
    vertexSource,
  );
  const fragmentShader = compileShader(
    gl,
    gl.createShader(gl.FRAGMENT_SHADER),
    fragmentSource,
  );

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);

  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Link failure", gl.getProgramInfoLog(program));
    throw new Error("Link failure");
  }

  const use = () => gl.useProgram(program);

  const uniform = <T extends number | vec2 | vec3 | vec4 | mat4>(
    name: string,
    f: (location: WebGLUniformLocation, value: T) => void,
  ) => {
    const location = gl.getUniformLocation(program, name);
    let cached: T | undefined;
    const set = (value: T) => {
      if (value === cached) return;
      if (location) f(location, value);
      cached = value;
    };
    return { set };
  };

  const uniform1f = (name: string) =>
    uniform<number>(name, (location, x) => gl.uniform1f(location, x));
  const uniform1i = (name: string) =>
    uniform<number>(name, (location, x) => gl.uniform1i(location, x));
  const uniform2f = (name: string) =>
    uniform<vec2>(name, (location, [x = 0, y = 0]) =>
      gl.uniform2f(location, x, y),
    );
  const uniform2i = (name: string) =>
    uniform<vec2>(name, (location, [x = 0, y = 0]) =>
      gl.uniform2i(location, x, y),
    );
  const uniform3f = (name: string) =>
    uniform<vec3>(name, (location, [x = 0, y = 0, z = 0]) =>
      gl.uniform3f(location, x, y, z),
    );
  const uniform3i = (name: string) =>
    uniform<vec3>(name, (location, [x = 0, y = 0, z = 0]) =>
      gl.uniform3i(location, x, y, z),
    );
  const uniform4f = (name: string) =>
    uniform<vec4>(name, (location, [x = 0, y = 0, z = 0, w = 0]) =>
      gl.uniform4f(location, x, y, z, w),
    );
  const uniform4i = (name: string) =>
    uniform<vec4>(name, (location, [x = 0, y = 0, z = 0, w = 0]) =>
      gl.uniform4i(location, x, y, z, w),
    );
  const uniformMatrix4f = (name: string) =>
    uniform<mat4>(name, (location, value) =>
      gl.uniformMatrix4fv(location, false, value),
    );

  const attribute = ({
    name,
    buffer,
    size,
    type,
    stride,
    offset,
  }: {
    name: string;
    buffer: Buffer;
    size: number;
    type: "f32" | "i32" | "u16";
    stride?: number;
    offset?: number;
  }) => {
    const location = gl.getAttribLocation(program, name);
    if (location === -1) throw new Error(`Missing attribute: ${name}`);

    const use = () => {
      buffer.use();
      gl.enableVertexAttribArray(location);
      if (["u16", "i32"].includes(type))
        gl.vertexAttribIPointer(
          location,
          size,
          type === "u16" ? gl.UNSIGNED_SHORT : gl.INT,
          stride || 0,
          offset || 0,
        );
      else
        gl.vertexAttribPointer(
          location,
          size,
          gl.FLOAT,
          false,
          stride || 0,
          offset || 0,
        );
    };

    return { use } satisfies Attribute;
  };

  const attribute2f = (
    name: string,
    buffer: Buffer,
    options: { stride?: number; offset?: number } = {},
  ) => attribute({ name, buffer, size: 2, type: "f32", ...options });

  const attribute3f = (
    name: string,
    buffer: Buffer,
    options: { stride?: number; offset?: number } = {},
  ) => attribute({ name, buffer, size: 3, type: "f32", ...options });

  const attribute3i = (
    name: string,
    buffer: Buffer,
    options: { stride?: number; offset?: number } = {},
  ) => attribute({ name, buffer, size: 3, type: "i32", ...options });

  const dispose = () => {
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
  };

  return {
    use,
    uniform1f,
    uniform1i,
    uniform2f,
    uniform2i,
    uniform3f,
    uniform3i,
    uniform4f,
    uniform4i,
    uniformMatrix4f,
    attribute2f,
    attribute3f,
    attribute3i,
    dispose,
  } satisfies Program;
};

const compileShader = (
  gl: WebGL2RenderingContext,
  shader: WebGLShader | null,
  source: string,
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
