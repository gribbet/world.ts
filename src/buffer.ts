export type BufferType = "f32" | "u16" | "u32" | "i32";

type TypedArray<T extends BufferType> = T extends "f32"
  ? Float32Array
  : T extends "u16"
    ? Uint16Array
    : T extends "u32"
      ? Uint32Array
      : T extends "i32"
        ? Int32Array
        : never;

export type Buffer<T extends BufferType> = {
  set: (value: number[] | TypedArray<T>) => void;
  use: () => void;
  dispose: () => void;
};

export const createBuffer = <T extends BufferType>({
  gl,
  type,
  target,
}: {
  gl: WebGL2RenderingContext;
  type: T;
  target: "array" | "element";
}) => {
  const buffer = gl.createBuffer();

  const glTarget =
    target === "array" ? gl.ARRAY_BUFFER : gl.ELEMENT_ARRAY_BUFFER;

  const use = () => gl.bindBuffer(glTarget, buffer);

  return {
    set: value => {
      use();
      const data =
        value instanceof Array
          ? type === "u16"
            ? new Uint16Array(value)
            : type === "u32"
              ? new Uint32Array(value)
              : type === "i32"
                ? new Int32Array(value)
                : new Float32Array(value)
          : value;
      gl.bufferData(glTarget, data, gl.DYNAMIC_DRAW);
    },
    use,
    dispose: () => gl.deleteBuffer(buffer),
  } satisfies Buffer<T>;
};
