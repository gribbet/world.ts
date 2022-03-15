import { glMatrix, mat4, vec2, vec3, vec4 } from "gl-matrix";
import fragmentSource from "./fragment.glsl";
import vertexSource from "./vertex.glsl";

/**
 * TODO:
 * - Float32 issues?
 * - Skirts
 * - non-zero altitude tiles
 * - mouse control
 * - picking
 * - sphere projection
 */

const imageryUrl = "http://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}";
const terrainUrl =
  "https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoiZ3JhaGFtZ2liYm9ucyIsImEiOiJja3Qxb3Q5bXQwMHB2MnBwZzVyNzgyMnZ6In0.4qLjlbLm6ASuJ5v5gN6FHQ";

const n = 30;
const z0 = 0;
const ONE = 1073741824; // 2^30
const CIRCUMFERENCE = 40075017;

glMatrix.setMatrixArrayType(Array);

const range = (start: number, end: number) =>
  Array.from({ length: end - start }, (_, k) => k + start);

const to = ([x, y, z]: vec3) =>
  [Math.floor(x * ONE), Math.floor(y * ONE), Math.floor(z * ONE)] as vec3;

const mercator = ([lng, lat, alt]: vec3) =>
  [
    lng / 360,
    -Math.asinh(Math.tan((lat / 180) * Math.PI)) / (2 * Math.PI),
    alt / CIRCUMFERENCE,
  ] as vec3;

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

interface Tile {
  imagery: WebGLTexture;
  terrain: WebGLTexture;
  loaded: boolean;
}

const start = () => {
  const canvas = document.querySelector<HTMLCanvasElement>("#canvas");
  const canvas2 = document.querySelector<HTMLCanvasElement>("#canvas2");
  if (!canvas || !canvas2) return;
  const gl = canvas.getContext("webgl") as WebGLRenderingContext;
  if (!gl) return;
  const context = canvas2.getContext("2d") as CanvasRenderingContext2D;
  if (!context) return;

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
  const imageryUniform = gl.getUniformLocation(program, "imagery");
  const terrainUniform = gl.getUniformLocation(program, "terrain");
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

  const loadTexture = (index: number, url: string, onLoad: () => void) => {
    const texture = gl.createTexture();

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      gl.activeTexture(gl.TEXTURE0 + index);
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
      onLoad();
    };
    image.onerror = (error) => {
      console.log("Tile load error", error);
      onLoad();
    };
    image.src = url;
    return texture!;
  };

  let tiles: Tile[][][] = [];
  const getTile = ([x, y, z]: vec3) => {
    const cached = tiles[z]?.[y]?.[x];
    if (cached) return cached;

    let imageryLoaded = false;
    let terrainLoaded = false;
    const imagery = loadTexture(
      1,
      imageryUrl
        .replace("{x}", `${x}`)
        .replace("{y}", `${y}`)
        .replace("{z}", `${z}`),
      () => (imageryLoaded = true)
    );
    const terrain = loadTexture(
      0,
      terrainUrl
        .replace("{x}", `${x}`)
        .replace("{y}", `${y}`)
        .replace("{z}", `${z}`),
      () => (terrainLoaded = true)
    );
    const tile: Tile = {
      imagery,
      terrain,
      get loaded() {
        return imageryLoaded && terrainLoaded;
      },
    };

    tiles[z] = tiles[z] || [];
    tiles[z][y] = tiles[z][y] || [];
    tiles[z][y][x] = tile;

    return tile;
  };

  const projection = mat4.create();
  const modelView = mat4.create();

  const render = (now: number) => {
    const center: vec3 = [-121.696, 45.3736, 3000];
    const pitch = 60;
    const bearing = now / 100;
    const distance = 20000;

    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const { innerWidth: width, innerHeight: height, devicePixelRatio } = window;

    gl.viewport(0, 0, width * devicePixelRatio, height * devicePixelRatio);

    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    canvas2.width = width * devicePixelRatio;
    canvas2.height = height * devicePixelRatio;

    mat4.identity(projection);
    mat4.perspective(
      projection,
      (30 * Math.PI) / 180,
      width / height,
      0.0000001,
      1
    );

    const [lng, lat, alt] = center;
    mat4.identity(modelView);
    mat4.translate(modelView, modelView, mercator([0, 0, -(distance - alt)]));
    mat4.rotateX(modelView, modelView, (-pitch * Math.PI) / 180);
    mat4.rotateZ(modelView, modelView, (bearing * Math.PI) / 180);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordinateBuffer);
    gl.vertexAttribPointer(uvAttribute, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(uvAttribute);

    gl.useProgram(program);
    gl.uniform1i(imageryUniform, 1);
    gl.uniform1i(terrainUniform, 0);
    gl.uniformMatrix4fv(projectionUniform, false, projection);
    gl.uniformMatrix4fv(modelViewUniform, false, modelView);
    gl.uniform3iv(cameraUniform, [...to(mercator(center))]);

    const project = ([u, v]: vec2, [x, y, z]: vec3) => {
      const k = Math.pow(2, -z);
      const [cx, cy, cz] = mercator(center);
      const [tx, ty, tz] = [
        (x + u) * k - 0.5 - cx,
        -((y + v) * k - 0.5 - cy),
        -cz,
      ] as vec3;
      const a = mat4.multiply(mat4.create(), projection, modelView);
      const [rx, ry, rz, rw] = vec4.multiply(
        vec4.create(),
        vec4.transformMat4(vec4.create(), [tx, ty, tz, 1], a),
        [1, -1, 1, 1]
      );
      return [rx / Math.abs(rw), ry / Math.abs(rw), rz / Math.abs(rw)] as vec3;
    };

    const all: vec2[] = [];
    const divide: (xyz: vec3) => vec3[] = (xyz: vec3) => {
      const [x, y, z] = xyz;
      if (z > 24) return [xyz];

      const clip = (uv: vec2) => project(uv, xyz);

      const vs = [clip([0, 0]), clip([1, 0]), clip([1, 1]), clip([0, 1])];
      const pixels = vs.map(
        ([x, y]) => [(x + 1) * width, (y + 1) * height] as vec2
      );
      all.push(...pixels);
      if (
        vs.every(([x]) => x > 1) ||
        vs.every(([x]) => x < -1) ||
        vs.every(([, y]) => y > 1) ||
        vs.every(([, y]) => y < -1) ||
        vs.every(([, , z]) => z > 1) ||
        vs.every(([, , z]) => z < -1)
      )
        return [];

      // TODO: Improve
      const size = Math.max(
        vec2.length(vec2.sub(vec2.create(), pixels[0], pixels[2])),
        vec2.length(vec2.sub(vec2.create(), pixels[1], pixels[3]))
      );
      if (size > 1024) {
        const divided: vec3[] = [
          [2 * x, 2 * y, z + 1],
          [2 * x + 1, 2 * y, z + 1],
          [2 * x, 2 * y + 1, z + 1],
          [2 * x + 1, 2 * y + 1, z + 1],
        ];
        if (divided.some((_) => !getTile(_).loaded)) return [xyz];
        return divided.flatMap((_) => divide(_));
      } else return [[x, y, z]];
    };

    const tiles = range(0, Math.pow(2, z0))
      .flatMap((x) => range(0, Math.pow(2, z0)).map<vec3>((y) => [x, y, z0]))
      .flatMap(divide);

    for (const xyz of tiles) {
      const { imagery, terrain } = getTile(xyz);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, imagery);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, terrain);
      gl.uniform3iv(xyzUniform, [...xyz]);

      gl.drawElements(gl.TRIANGLES, n * n * 2 * 3, gl.UNSIGNED_SHORT, 0);
    }

    requestAnimationFrame(render);

    context.fillStyle = "white";
    all.forEach(([x, y]) => context.fillRect(x - 5, y - 5, 10, 10));
  };

  requestAnimationFrame(render);
};

start();
