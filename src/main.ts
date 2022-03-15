import { glMatrix, mat4, vec2, vec3, vec4 } from "gl-matrix";
import fragmentSource from "./fragment.glsl";
import vertexSource from "./vertex.glsl";

/**
 * TODO:
 * - Skirts
 * - mouse drag and zoom
 * - picking
 * - sphere projection
 * - smooth transition
 */

const imageryUrl = "http://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}";
const terrainUrl =
  "https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoiZ3JhaGFtZ2liYm9ucyIsImEiOiJja3Qxb3Q5bXQwMHB2MnBwZzVyNzgyMnZ6In0.4qLjlbLm6ASuJ5v5gN6FHQ";
const n = 30;
const z0 = 0;
const ONE = 1073741824; // 2^30
const CIRCUMFERENCE = 40075017;
const center: vec3 = [-121.696, 45.3736, 3000];
let pitch = 0;
let bearing = 0;
let distance = 10000;

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
  elevation: number;
}

const start = () => {
  const canvas = document.querySelector<HTMLCanvasElement>("#canvas");
  if (!canvas) return;

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  canvas.addEventListener(
    "mousemove",
    ({ buttons, movementX, movementY, x, y }) => {
      pick([x, y]);
      if (buttons !== 2) return;
      bearing += movementX / Math.PI;
      pitch += -movementY / Math.PI;
    }
  );

  const gl = canvas.getContext("webgl") as WebGL2RenderingContext;
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

  const targetTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, targetTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const depthBuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);

  gl.bindTexture(gl.TEXTURE_2D, targetTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    window.innerWidth * devicePixelRatio,
    window.innerHeight * devicePixelRatio,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null
  );

  gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
  gl.renderbufferStorage(
    gl.RENDERBUFFER,
    gl.DEPTH_COMPONENT16,
    window.innerWidth * devicePixelRatio,
    window.innerHeight * devicePixelRatio
  );

  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    targetTexture,
    0
  );
  gl.framebufferRenderbuffer(
    gl.FRAMEBUFFER,
    gl.DEPTH_ATTACHMENT,
    gl.RENDERBUFFER,
    depthBuffer
  );

  const loadTexture = ({
    index,
    url,
    xyz,
    onLoad,
    onError,
  }: {
    index: number;
    url: string;
    xyz: vec3;
    onLoad?: () => void;
    onError?: () => void;
  }) => {
    const [x, y, z] = xyz;
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
      onLoad?.();
    };
    image.onerror = (error) => {
      console.log("Tile load error", error);
      onError?.();
    };
    image.src = url
      .replace("{x}", `${x}`)
      .replace("{y}", `${y}`)
      .replace("{z}", `${z}`);
    return texture!;
  };

  const elevationFramebuffer = gl.createFramebuffer();
  const getTileElevation = (texture: WebGLTexture) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, elevationFramebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0
    );
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const [r, g, b] = pixel;
    const elevation = (256 * 256 * r + 256 * g + b - 100000) * 0.1;
    return elevation;
  };

  let tiles: Tile[][][] = [];
  const getTile = (xyz: vec3) => {
    const [x, y, z] = xyz;
    const cached = tiles[z]?.[y]?.[x];
    if (cached) return cached;

    let imageryLoaded = false;
    let terrainLoaded = false;
    let elevation = 0;
    const imagery = loadTexture({
      index: 1,
      url: imageryUrl,
      xyz,
      onLoad: () => {
        imageryLoaded = true;
        gl.bindTexture(gl.TEXTURE_2D, imagery);
        gl.generateMipmap(gl.TEXTURE_2D);
      },
    });
    const terrain = loadTexture({
      index: 0,
      url: terrainUrl,
      xyz,
      onLoad: () => {
        terrainLoaded = true;
        elevation = getTileElevation(terrain);
      },
      onError: () => {
        terrainLoaded = true;
      },
    });
    gl.bindTexture(gl.TEXTURE_2D, terrain);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    const tile: Tile = {
      imagery,
      terrain,
      get loaded() {
        return imageryLoaded && terrainLoaded;
      },
      get elevation() {
        return elevation;
      },
    };

    tiles[z] = tiles[z] || [];
    tiles[z][y] = tiles[z][y] || [];
    tiles[z][y][x] = tile;

    return tile;
  };

  const project = ([u, v]: vec2, [x, y, z]: vec3, elevation: number) => {
    const k = Math.pow(2, -z);
    const [cx, cy, cz] = mercator(center);
    const [, , oz] = mercator([0, 0, elevation]);
    const [tx, ty, tz] = [
      (x + u) * k - 0.5 - cx,
      -((y + v) * k - 0.5 - cy),
      -cz + oz,
    ] as vec3;
    const a = mat4.multiply(mat4.create(), projection, modelView);
    const [rx, ry, rz, rw] = vec4.multiply(
      vec4.create(),
      vec4.transformMat4(vec4.create(), [tx, ty, tz, 1], a),
      [1, -1, 1, 1]
    );
    return [rx / Math.abs(rw), ry / Math.abs(rw), rz / Math.abs(rw)] as vec3;
  };

  const divide: (xyz: vec3, size: vec2) => vec3[] = (xyz, [width, height]) => {
    const [x, y, z] = xyz;
    if (z > 24) return [xyz];

    const corners: vec2[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const { elevation } = getTile(xyz);
    const clip = corners.map((_) => project(_, xyz, elevation));

    if (
      clip.every(([x]) => x > 1) ||
      clip.every(([x]) => x < -1) ||
      clip.every(([, y]) => y > 1) ||
      clip.every(([, y]) => y < -1) ||
      clip.every(([, , z]) => z > 1) ||
      clip.every(([, , z]) => z < -1)
    )
      return [];

    const pixels = clip.map(
      ([x, y]) => [(x + 1) * width, (y + 1) * height] as vec2
    );
    const area =
      range(0, 4)
        .map((i) => {
          const [x1, y1] = pixels[i];
          const [x2, y2] = pixels[(i + 1) % pixels.length];
          return x1 * y2 - x2 * y1;
        })
        .reduce((a, b) => a + b, 0) * 0.5;

    if (area > 256 * 256 * window.devicePixelRatio * window.devicePixelRatio) {
      const divided: vec3[] = [
        [2 * x, 2 * y, z + 1],
        [2 * x + 1, 2 * y, z + 1],
        [2 * x, 2 * y + 1, z + 1],
        [2 * x + 1, 2 * y + 1, z + 1],
      ];
      const next = divided.flatMap((_) => divide(_, [width, height]));
      if (next.some((_) => !getTile(_).loaded)) return [xyz];
      return next;
    } else return [xyz];
  };

  const projection = mat4.create();
  const modelView = mat4.create();

  const render = () => {
    const [, , near] = mercator([0, 0, distance / 100]);
    const [, , far] = mercator([0, 0, 100 * distance]);

    gl.clearColor(0, 0, 0, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const { innerWidth: width, innerHeight: height, devicePixelRatio } = window;

    gl.viewport(0, 0, width * devicePixelRatio, height * devicePixelRatio);

    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;

    mat4.identity(projection);
    mat4.perspective(
      projection,
      (45 * Math.PI) / 180,
      width / height,
      near,
      far
    );

    const [, , altitude] = center;
    mat4.identity(modelView);
    mat4.translate(
      modelView,
      modelView,
      mercator([0, 0, -(distance - altitude)])
    );
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

    const tiles = range(0, Math.pow(2, z0))
      .flatMap((x) => range(0, Math.pow(2, z0)).map<vec3>((y) => [x, y, z0]))
      .flatMap((xyz) => divide(xyz, [width, height]));

    for (const xyz of tiles) {
      const { imagery, terrain } = getTile(xyz);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, imagery);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, terrain);
      gl.uniform3iv(xyzUniform, [...xyz]);

      gl.drawElements(gl.TRIANGLES, n * n * 2 * 3, gl.UNSIGNED_SHORT, 0);
    }
  };

  const frame = (now: number) => {
    render();

    requestAnimationFrame(frame);
  };

  const pick = ([x, y]: vec2) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    render();
    const buffer = new Uint8Array(4);
    gl.readPixels(
      x * 2,
      (window.innerHeight - y) * 2,
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      buffer
    );

    const [r, g] = buffer;

    const depth =
      ((r / 256 + g / 256 / 256) * (256.0 * 256.0)) / (256.0 * 256.0 - 1.0);

    const [, , near] = mercator([0, 0, distance / 100]);
    const [, , far] = mercator([0, 0, 100 * distance]);

    const znorm = 2 * depth - 1;
    console.log(
      ((2 * (near * far)) / (far + near - znorm * (far - near))) * CIRCUMFERENCE
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  requestAnimationFrame(frame);
};

start();
