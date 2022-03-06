import { mat4 } from "gl-matrix";

export function range(start: number, end: number) {
  return Array.from({ length: end - start }, (_, k) => k + start);
}

const vertexShaderSource = `
attribute vec4 position;
attribute vec2 textureCoordinate;
uniform mat4 modelView;
uniform mat4 projection;

varying highp vec2 textureCoordinateOut;

void main(void) {
  gl_Position = projection * modelView * position;
  textureCoordinateOut = textureCoordinate;
}
`;

const fragmentShaderSource = `
varying highp vec2 textureCoordinateOut;

uniform sampler2D sampler;

void main(void) {
  gl_FragColor = texture2D(sampler, textureCoordinateOut);
}
`;

const n = 10;
const positions = range(0, n + 1).flatMap((y) =>
  range(0, n + 1).flatMap((x) => [(2 * x) / n - 1, 1 - (2 * y) / n, 1])
);

const indices = range(0, n).flatMap((y) =>
  range(0, n).flatMap((x) => [
    y * (n + 1) + x,
    (y + 1) * (n + 1) + x + 1,
    y * (n + 1) + x + 1,
    y * (n + 1) + x,
    (y + 1) * (n + 1) + x,
    (y + 1) * (n + 1) + x + 1,
  ])
);

const textureCoordinates = range(0, n + 1).flatMap((y) =>
  range(0, n + 1).flatMap((x) => [x / n, y / n])
);

start();

function start() {
  const canvas = document.querySelector<HTMLCanvasElement>("canvas");
  const gl: WebGLRenderingContext = canvas.getContext("webgl");

  if (!gl) return;

  function loadShader(type: number, source: string) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.log("Compilation failed", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return;
    }

    return shader;
  }

  const vertexShader = loadShader(gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = loadShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
  if (!vertexShader || !fragmentShader) return;

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.log("Link failure", gl.getProgramInfoLog(program));
    return;
  }

  const positionAttribute = gl.getAttribLocation(program, "position");
  const textureCoordinateAttribute = gl.getAttribLocation(
    program,
    "textureCoordinate"
  );
  const projectionUniform = gl.getUniformLocation(program, "projection");
  const modelViewUniform = gl.getUniformLocation(program, "modelView");
  const samplerUniform = gl.getUniformLocation(program, "sampler");

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indices),
    gl.STATIC_DRAW
  );

  const textureCoordinateBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordinateBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(textureCoordinates),
    gl.STATIC_DRAW
  );

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 255])
  );

  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = function () {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
  };
  image.src = "http://mt0.google.com/vt/lyrs=y&hl=en&x=0&y=0&z=0";

  function render() {
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(100);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const { innerWidth: width, innerHeight: height } = window;

    gl.viewport(0, 0, width, height);

    canvas.width = width;
    canvas.height = height;

    const projection = mat4.create();
    mat4.perspective(
      projection,
      (45 * Math.PI) / 180,
      width / height,
      0.1,
      100.0
    );

    const modelView = mat4.create();
    mat4.translate(modelView, modelView, [0, 0, -5.0]);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionAttribute, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(positionAttribute);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordinateBuffer);
    gl.vertexAttribPointer(
      textureCoordinateAttribute,
      2,
      gl.FLOAT,
      false,
      0,
      0
    );
    gl.enableVertexAttribArray(textureCoordinateAttribute);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(samplerUniform, 0);

    gl.useProgram(program);

    gl.uniformMatrix4fv(projectionUniform, false, projection);
    gl.uniformMatrix4fv(modelViewUniform, false, modelView);

    gl.drawElements(gl.TRIANGLES, n * n * 2 * 3, gl.UNSIGNED_SHORT, 0);

    requestAnimationFrame(render);
  }

  render();
}
