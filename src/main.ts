import { mat4 } from "gl-matrix";

export function range(start: number, end: number) {
  return Array.from({ length: end - start }, (_, k) => k + start);
}

const vertexShaderSource = `
attribute vec2 textureCoordinate;
uniform mat4 modelView;
uniform mat4 projection;
uniform float x;
uniform float y;
uniform float z;
uniform vec3 camera;

varying highp vec2 textureCoordinateOut;

const float a = 6371.;
const float b = 6357.;

vec3 ecef(vec3 position) {
    float sx = sin(position.x);
    float cx = cos(position.x);
    float sy = sin(position.y);
    float cy = cos(position.y);
    float z = position.z;
    float n = 1. / sqrt(a * a * cy * cy + b * b * sy * sy);
    return vec3(
        (n * a * a + z) * cx * cy,
        (n * a * a + z) * sx * cy,
        (n * b * b + z) * sy);
}

void main(void) {
    float longitude = (x + textureCoordinate.x) * 180. * 2. / pow(2., z) - 180.;
    float latitude = -(y + textureCoordinate.y) * 85.0511 * 2. / pow(2., z) + 85.0511;
    vec3 ground = vec3(radians(longitude), radians(latitude), 0.);

    float sx = sin(camera.x);
    float cx = cos(camera.x);
    float sy = sin(camera.y);
    float cy = cos(camera.y);

    vec3 enu = (ecef(ground) - ecef(camera)) * mat3(
        -sx, cx, 0.,
        -cx * sy, -sx * sy, cy,
        cx * cy, sx * cy, sy
    );

    gl_Position = projection * modelView * vec4(enu, 1.);
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
const z = 3;

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

  const textureCoordinateAttribute = gl.getAttribLocation(
    program,
    "textureCoordinate"
  );
  const projectionUniform = gl.getUniformLocation(program, "projection");
  const modelViewUniform = gl.getUniformLocation(program, "modelView");
  const samplerUniform = gl.getUniformLocation(program, "sampler");
  const xUniform = gl.getUniformLocation(program, "x");
  const yUniform = gl.getUniformLocation(program, "y");
  const zUniform = gl.getUniformLocation(program, "z");
  const cameraUniform = gl.getUniformLocation(program, "camera");

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

  const textures = range(0, Math.pow(2, z)).map((x) =>
    range(0, Math.pow(2, z)).map((y) => {
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
        new Uint8Array([0, 0, 0, 0])
      );

      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = function () {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          image
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      };
      image.src = `http://mt0.google.com/vt/lyrs=y&hl=en&x=${x}&y=${y}&z=${z}`;

      return texture;
    })
  );

  const start = performance.now();

  function render() {
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(10);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const { innerWidth: width, innerHeight: height, devicePixelRatio } = window;

    gl.viewport(0, 0, width * devicePixelRatio, height * devicePixelRatio);

    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;

    const projection = mat4.create();
    mat4.perspective(
      projection,
      (60 * Math.PI) / 180,
      width / height,
      0.1,
      100000
    );

    const modelView = mat4.create();

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

    gl.useProgram(program);
    gl.uniform1i(samplerUniform, 0);
    gl.uniformMatrix4fv(projectionUniform, false, projection);
    gl.uniformMatrix4fv(modelViewUniform, false, modelView);
    gl.uniform1f(zUniform, z);
    gl.uniform3fv(cameraUniform, [
      (-121 / 180) * Math.PI,
      (37 / 180) * Math.PI,
      2 * 6370,
    ]);

    gl.activeTexture(gl.TEXTURE0);

    for (let x = 0; x < Math.pow(2, z); x++) {
      gl.uniform1f(xUniform, x);
      for (let y = 0; y < Math.pow(2, z); y++) {
        gl.uniform1f(yUniform, y);
        gl.bindTexture(gl.TEXTURE_2D, textures[x][y]);
        gl.drawElements(gl.TRIANGLES, n * n * 2 * 3, gl.UNSIGNED_SHORT, 0);
      }
    }

    requestAnimationFrame(render);
  }

  render();
}
