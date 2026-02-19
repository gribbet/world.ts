import type { mat4, vec2, vec3, vec4 } from "gl-matrix";

import type { Buffer, BufferType } from "./buffer";

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
  attribute1f: (
    name: string,
    buffer: Buffer<"f32">,
    _?: { stride?: number; offset?: number },
  ) => Attribute;
  attribute2f: (
    name: string,
    buffer: Buffer<"f32">,
    _?: { stride?: number; offset?: number },
  ) => Attribute;
  attribute3f: (
    name: string,
    buffer: Buffer<"f32">,
    _?: { stride?: number; offset?: number },
  ) => Attribute;
  attribute3i: (
    name: string,
    buffer: Buffer<"i32">,
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

  type UniformValue = number | vec2 | vec3 | vec4 | mat4;
  type Uniform<T extends UniformValue> = {
    set: (value: T) => void;
  };
  const uniforms: {
    [name: string]: Uniform<never>;
  } = {};
  const uniform = <T extends UniformValue>(
    name: string,
    f: (location: WebGLUniformLocation, value: T) => void,
  ) => {
    if (uniforms[name]) return uniforms[name] as Uniform<T>;
    const location = gl.getUniformLocation(program, name);
    let lastValue: T | undefined;
    const set = (value: T) => {
      if (location && value !== lastValue) {
        f(location, value);
        lastValue = value;
      }
    };
    uniforms[name] = { set };
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
      gl.uniformMatrix4fv(location, false, value as Float32List),
    );

  const attribute = <T extends BufferType>({
    name,
    buffer,
    size,
    type,
    stride,
    offset,
  }: {
    name: string;
    buffer: Buffer<T>;
    size: number;
    type: T;
    stride?: number;
    offset?: number;
  }) => {
    let location: number | undefined;

    const use = () => {
      if (location === undefined) {
        location = gl.getAttribLocation(program, name);
        if (location === -1) throw new Error(`Missing attribute: ${name}`);
      }
      buffer.use();
      gl.enableVertexAttribArray(location);
      if (type === "u16" || type === "u32" || type === "i32")
        gl.vertexAttribIPointer(
          location,
          size,
          type === "u16"
            ? gl.UNSIGNED_SHORT
            : type === "u32"
              ? gl.UNSIGNED_INT
              : gl.INT,
          stride ?? 0,
          offset ?? 0,
        );
      else
        gl.vertexAttribPointer(
          location,
          size,
          gl.FLOAT,
          false,
          stride ?? 0,
          offset ?? 0,
        );
    };

    return { use } satisfies Attribute;
  };

  const attribute1f = (
    name: string,
    buffer: Buffer<"f32">,
    options: { stride?: number; offset?: number } = {},
  ) => attribute({ name, buffer, size: 1, type: "f32", ...options });

  const attribute2f = (
    name: string,
    buffer: Buffer<"f32">,
    options: { stride?: number; offset?: number } = {},
  ) => attribute({ name, buffer, size: 2, type: "f32", ...options });

  const attribute3f = (
    name: string,
    buffer: Buffer<"f32">,
    options: { stride?: number; offset?: number } = {},
  ) => attribute({ name, buffer, size: 3, type: "f32", ...options });

  const attribute3i = (
    name: string,
    buffer: Buffer<"i32">,
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
    attribute1f,
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
