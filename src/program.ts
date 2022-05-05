export const createProgram = ({
  gl,
  vertexSource,
  fragmentSource,
}: {
  gl: WebGLRenderingContext;
  vertexSource: string;
  fragmentSource: string;
}) => {
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

  return program;
};

const compileShader = (
  gl: WebGLRenderingContext,
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
