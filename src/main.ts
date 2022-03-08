import { mat3, mat4, vec2, vec3, vec4 } from "gl-matrix";
import fragmentSource from "./fragment.glsl";
import vertexSource from "./vertex.glsl";

const n = 10;
const z0 = 1;

const ecef = ([x, y, z]: vec3) => {
  const r = 6371;
  const sx = Math.sin(x);
  const cx = Math.cos(x);
  const sy = Math.sin(y);
  const cy = Math.cos(y);
  const n = r / Math.sqrt(cy * cy + sy * sy);
  const result: vec3 = [(n + z) * cx * cy, (n + z) * sx * cy, (n + z) * sy];
  return result;
};

const project = ([u, v]: vec2, [x, y, z]: vec3, [ox, oy, oz]: vec3) => {
  const k = 1 / Math.pow(2, z - 1);
  const [qx, qy] = [k * (x + u) - 1, k * (y + v) - 1];

  const ground: vec3 = [qx * Math.PI, Math.atan(Math.sinh(-Math.PI * qy)), 0];

  const sx = Math.sin(ox);
  const cx = Math.cos(ox);
  const sy = Math.sin(oy);
  const cy = Math.cos(oy);

  return vec3.transformMat3(
    vec3.create(),
    vec3.sub(vec3.create(), ecef(ground), ecef([ox, oy, oz])),
    mat3.transpose(
      mat3.create(),
      mat3.fromValues(-sx, cx, 0, -cx * sy, -sx * sy, cy, cx * cy, sx * cy, sy)
    )
  );
};

const range = (start: number, end: number) =>
  Array.from({ length: end - start }, (_, k) => k + start);

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

const uv = range(0, n + 1).flatMap((y) =>
  range(0, n + 1).flatMap((x) => [x / n, y / n])
);

const start = () => {
  const canvas = document.querySelector<HTMLCanvasElement>("canvas");
  if (!canvas) return;
  const gl = canvas.getContext("webgl") as WebGLRenderingContext;
  if (!gl) return;

  function loadShader(type: number, source: string) {
    const shader = gl.createShader(type);
    if (!shader) return;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.log("Compilation failed", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return;
    }

    return shader;
  }

  const vertexShader = loadShader(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = loadShader(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) return;

  const program = gl.createProgram();
  if (!program) return;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.log("Link failure", gl.getProgramInfoLog(program));
    return;
  }

  const uvAttribute = gl.getAttribLocation(program, "uv");
  const projectionUniform = gl.getUniformLocation(program, "projection");
  const modelViewUniform = gl.getUniformLocation(program, "modelView");
  const samplerUniform = gl.getUniformLocation(program, "sampler");
  const xyzUniform = gl.getUniformLocation(program, "xyz");
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
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);

  let textures: WebGLTexture[][][] = [];
  const getTexture = ([x, y, z]: vec3) => {
    const cached = textures[z]?.[y]?.[x];
    if (cached) return cached;
    textures[z] = textures[z] || [];
    textures[z][y] = textures[z][y] || [];
    textures[z][y][x] = createTexture([x, y, z]);
    return textures[z][y][x];
  };

  const createTexture = ([x, y, z]: vec3) => {
    const texture = gl.createTexture();

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
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
    image.src = `http://mt0.google.com/vt/lyrs=s&hl=en&x=${x}&y=${y}&z=${z}`;

    return texture!;
  };

  const start = performance.now();
  const render = () => {
    const camera: vec3 = [
      (-121 / 180) * Math.PI,
      (37 / 180) * Math.PI,
      10000 * Math.exp(-performance.now() / 1000.0) + 0.1,
    ];

    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(10);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const { innerWidth: width, innerHeight: height, devicePixelRatio } = window;

    gl.viewport(0, 0, width * devicePixelRatio, height * devicePixelRatio);

    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;

    const projection = mat4.perspective(
      mat4.create(),
      (45 * Math.PI) / 180,
      width / height,
      0.01,
      10000
    );

    const modelView = mat4.create();

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordinateBuffer);
    gl.vertexAttribPointer(uvAttribute, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(uvAttribute);

    gl.useProgram(program);
    gl.uniform1i(samplerUniform, 0);
    gl.uniformMatrix4fv(projectionUniform, false, projection);
    gl.uniformMatrix4fv(modelViewUniform, false, modelView);
    gl.uniform3fv(cameraUniform, camera);

    gl.activeTexture(gl.TEXTURE0);

    const divide: (xyz: vec3) => vec3[] = ([x, y, z]: vec3) => {
      if (z > 22) return [[x, y, z]];
      const clip = (uv: vec2) => {
        const [tx, ty, tz] = project(uv, [x, y, z], camera);
        const [rx, ry, rz, rw] = vec4.transformMat4(
          vec4.create(),
          [tx, ty, tz, 1],
          projection
        );
        const result: vec3 = [rx / rw, ry / rw, rz / rw];
        return result;
      };
      const v0 = clip([0, 0]);
      const v1 = clip([1, 0]);
      const v2 = clip([1, 1]);
      const v3 = clip([0, 1]);
      const vs = [v0, v1, v2, v3];

      if (
        vs.every(([x]) => x > 1) ||
        vs.every(([x]) => x < -1) ||
        vs.every(([, y]) => y > 1) ||
        vs.every(([, y]) => y < -1) ||
        vs.every(([, , z]) => z > 1) ||
        vs.every(([, , z]) => z < -1)
      )
        return [];

      const pixels = ([x, y]: vec3) => [width * x, height * y] as vec2;

      const size = Math.max(
        vec2.length(vec2.sub(vec2.create(), pixels(v0), pixels(v2))),
        vec2.length(vec2.sub(vec2.create(), pixels(v1), pixels(v3)))
      );
      if (size > 1024) {
        const divided: vec3[] = [
          [2 * x, 2 * y, z + 1],
          [2 * x + 1, 2 * y, z + 1],
          [2 * x, 2 * y + 1, z + 1],
          [2 * x + 1, 2 * y + 1, z + 1],
        ];
        return divided.flatMap((_) => divide(_));
      } else return [[x, y, z]];
    };

    const tiles = range(0, Math.pow(2, z0))
      .flatMap((x) => range(0, Math.pow(2, z0)).map<vec3>((y) => [x, y, z0]))
      .flatMap(divide);

    console.log(tiles.length);
    for (const [x, y, z] of tiles) {
      gl.uniform3fv(xyzUniform, [x, y, z]);
      gl.bindTexture(gl.TEXTURE_2D, getTexture([x, y, z]));
      gl.drawElements(gl.TRIANGLES, n * n * 2 * 3, gl.UNSIGNED_SHORT, 0);
    }

    requestAnimationFrame(render);
  };

  render();
};

start();
