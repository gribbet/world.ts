export type Buffer = {
  set: (value: number[]) => void;
  use: () => void;
  destroy: () => void;
};

export const createBuffer = ({
  gl,
  type,
  target,
}: {
  gl: WebGL2RenderingContext;
  type: "f32" | "u16" | "i32";
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
      gl.bufferData(
        glTarget,
        type === "u16"
          ? new Uint16Array(value)
          : type === "i32"
            ? new Int32Array(value)
            : new Float32Array(value),
        gl.DYNAMIC_DRAW,
      );
    },
    use,
    destroy: () => gl.deleteBuffer(buffer),
  } satisfies Buffer;
};
