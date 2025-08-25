export type Buffer = {
  set: (value: number[] | ArrayBufferView) => void;
  use: () => void;
  dispose: () => void;
};

export const createBuffer = ({
  gl,
  type,
  target,
}: {
  gl: WebGL2RenderingContext;
  type: "f32" | "u16" | "u32" | "i32";
  target: "array" | "element";
}) => {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("Buffer creation failed");

  const glTarget =
    target === "array" ? gl.ARRAY_BUFFER : gl.ELEMENT_ARRAY_BUFFER;

  const use = () => gl.bindBuffer(glTarget, buffer);

  return {
    set: value => {
      use();
      const data = ArrayBuffer.isView(value)
        ? value
        : type === "u16"
          ? new Uint16Array(value)
          : type === "u32"
            ? new Uint32Array(value)
            : type === "i32"
              ? new Int32Array(value)
              : new Float32Array(value);
      gl.bufferData(glTarget, data as ArrayBufferView, gl.DYNAMIC_DRAW);
    },
    use,
    dispose: () => gl.deleteBuffer(buffer),
  } satisfies Buffer;
};
