import { glMatrix, mat4, vec2, vec3, vec4 } from "gl-matrix";
import * as LruCache from "lru-cache";
import depthSource from "./depth.glsl";
import { elevation } from "./elevation";
import renderSource from "./render.glsl";
import vertexSource from "./vertex.glsl";

/**
 * TODO:
 * - abs everywhere?
 * - cancel load
 * - smooth transition
 * - elevation tile -1
 */
const imageryUrl = "http://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}";
const terrainUrl =
  "https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoiZ3JhaGFtZ2liYm9ucyIsImEiOiJja3Qxb3Q5bXQwMHB2MnBwZzVyNzgyMnZ6In0.4qLjlbLm6ASuJ5v5gN6FHQ";

const n = 16;
const one = 1073741824; // 2^30
const circumference = 40075017;
let camera: vec3 = [-121.696, 45.3736, 13000];
let bearing = 0;
let pitch = (30 / 180) * Math.PI;

glMatrix.setMatrixArrayType(Array);

const debounce = (f: (...args: any[]) => void, delay: number) => {
  let timeout: number;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => f(args), delay);
  };
};

const range = (start: number, end: number) =>
  Array.from({ length: end - start }, (_, k) => k + start);

const to = ([x, y, z]: vec3) =>
  [Math.floor(x * one), Math.floor(y * one), Math.floor(z * one)] as vec3;

const quadratic = (a: number, b: number, c: number) => {
  const q = Math.sqrt(b * b - 4 * a * c);
  return [(-b - q) / (2 * a), (-b + q) / (2 * a)];
};

const mercator = ([lng, lat, alt]: vec3) =>
  [
    lng / 360 + 0.5,
    -Math.asinh(Math.tan((lat / 180) * Math.PI)) / (2 * Math.PI) + 0.5,
    alt / circumference,
  ] as vec3;

const geodetic = ([x, y, z]: vec3) =>
  [
    (x - 0.5) * 360,
    (Math.atan(Math.sinh(-(y - 0.5) * (2 * Math.PI))) * 180) / Math.PI,
    z * circumference,
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

const uvw = range(0, n + 1).flatMap((y) =>
  range(0, n + 1).flatMap((x) => {
    let u = (x - 1) / (n - 2);
    let v = (y - 1) / (n - 2);
    let w = 0;
    if (x === 0) {
      u = 0;
      w = -0.1;
    }
    if (x === n) {
      u = 1;
      w = -0.1;
    }
    if (y === 0) {
      v = 0;
      w = -0.1;
    }
    if (y === n) {
      v = 1;
      w = -0.1;
    }

    return [u, v, w];
  })
);

interface Tile {
  imagery: WebGLTexture;
  terrain: WebGLTexture;
  loaded: boolean;
  dispose: () => void;
}

interface Anchor {
  screen: vec2;
  world: vec3;
}

const start = () => {
  const canvas = document.querySelector<HTMLCanvasElement>("#canvas");
  if (!canvas) return;

  const canvas2 = document.querySelector<HTMLCanvasElement>("#canvas2");
  if (!canvas2) return;

  const projection = mat4.create();
  const modelView = mat4.create();
  const vector = vec3.create();

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  let anchor: Anchor | undefined;

  const clearAnchor = debounce(() => {
    anchor = undefined;
  }, 100);

  canvas.addEventListener("mousedown", ({ x, y }) => {
    anchor = {
      screen: [x, y],
      world: pick([x, y]),
    };
  });

  canvas.addEventListener(
    "mousemove",
    ({ buttons, movementX, movementY, x, y }) => {
      if (!anchor) return;

      if (buttons === 1) {
        anchor = {
          ...anchor,
          screen: [x, y],
        };
      } else if (buttons === 2) {
        bearing -= (movementX / window.innerHeight) * Math.PI;
        pitch -= (movementY / window.innerWidth) * Math.PI;
      }
    }
  );

  canvas.addEventListener("mouseup", clearAnchor);

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();

    const { x, y } = event;
    if (!anchor)
      anchor = {
        screen: [x, y],
        world: pick([x, y]),
      };

    camera = vec3.add(
      vector,
      camera,
      vec3.scale(
        vector,
        vec3.sub(vector, camera, anchor.world),
        event.deltaY * 0.001
      )
    );

    clearAnchor();
  });

  const gl = canvas.getContext("webgl") as WebGL2RenderingContext;
  if (!gl) return;

  const context = canvas2.getContext("2d") as CanvasRenderingContext2D;
  if (!context) return;

  const loadShader = (type: number, source: string) => {
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
  };

  const vertexShader = loadShader(gl.VERTEX_SHADER, vertexSource);
  const renderShader = loadShader(gl.FRAGMENT_SHADER, renderSource);
  const depthShader = loadShader(gl.FRAGMENT_SHADER, depthSource);
  if (!vertexShader || !renderShader || !depthShader) return;

  const renderProgram = gl.createProgram();
  if (!renderProgram) return;
  gl.attachShader(renderProgram, vertexShader);
  gl.attachShader(renderProgram, renderShader);
  gl.linkProgram(renderProgram);

  if (!gl.getProgramParameter(renderProgram, gl.LINK_STATUS)) {
    console.log("Link failure", gl.getProgramInfoLog(renderProgram));
    return;
  }

  const depthProgram = gl.createProgram();
  if (!depthProgram) return;
  gl.attachShader(depthProgram, vertexShader);
  gl.attachShader(depthProgram, depthShader);
  gl.linkProgram(depthProgram);

  if (!gl.getProgramParameter(depthProgram, gl.LINK_STATUS)) {
    console.log("Link failure", gl.getProgramInfoLog(depthProgram));
    return;
  }

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indices),
    gl.STATIC_DRAW
  );

  const uvwBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uvwBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvw), gl.STATIC_DRAW);

  const targetTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, targetTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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

  const depthBuffer = gl.createRenderbuffer();
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
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  gl.clearColor(0, 0, 0, 1);
  gl.enable(gl.DEPTH_TEST);

  const loadTile = ({
    url,
    xyz,
    subdivide = 0,
    onLoad,
    onError,
  }: {
    url: string;
    xyz: vec3;
    subdivide?: number;
    onLoad?: () => void;
    onError?: () => void;
  }) => {
    const [x0, y0, z0] = xyz;
    subdivide = Math.min(subdivide, z0);
    const k = Math.pow(2, subdivide);
    const [x, y, z] = [Math.floor(x0 / k), Math.floor(y0 / k), z0 - subdivide];
    const [u, v, w] = [x0 % k, y0 % k, subdivide];

    const texture = gl.createTexture();
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = async () => {
      const k = image.width * Math.pow(2, -w);
      const cropped = await createImageBitmap(image, k * u, k * v, k, k);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        cropped
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

  let tiles = new LruCache<string, Tile>({
    max: 500,
    dispose: (tile) => {
      tile.dispose();
    },
  });
  const getTile = (xyz: vec3) => {
    const [x, y, z] = xyz;
    const key = `${z}-${x}-${y}`;
    const cached = tiles.get(key);
    if (cached) return cached;

    let imageryLoaded = false;
    let terrainLoaded = false;
    const imagery = loadTile({
      url: imageryUrl,
      xyz,
      onLoad: () => {
        imageryLoaded = true;
        gl.bindTexture(gl.TEXTURE_2D, imagery);
        gl.generateMipmap(gl.TEXTURE_2D);
      },
    });
    const terrain = loadTile({
      url: terrainUrl,
      xyz,
      subdivide: 4,
      onLoad: () => {
        terrainLoaded = true;
        gl.bindTexture(gl.TEXTURE_2D, terrain);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      },
      onError: () => {
        terrainLoaded = true;
      },
    });

    const tile: Tile = {
      imagery,
      terrain,
      get loaded() {
        return imageryLoaded && terrainLoaded;
      },
      dispose: () => {
        gl.deleteTexture(imagery);
        gl.deleteTexture(terrain);
      },
    };

    tiles.set(key, tile);

    return tile;
  };

  const matrix = mat4.create();
  const project = ([u, v]: vec2, [x, y, z]: vec3) => {
    const k = Math.pow(2, -z);
    const [cx, cy, cz] = mercator(camera);
    const [lx, ly, lz] = [(x + u) * k, (y + v) * k, 0] as vec3;
    const [lng, lat] = geodetic([lx, ly, lz]);
    const h = elevation([lng, lat]);
    const [, , zz] = mercator([0, 0, h || 0]);
    const [tx, ty, tz] = [lx - cx, ly - cy, lz - cz + zz];
    return localToClip([tx, ty, tz]);
  };

  const corners: vec2[] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];

  let allPixels: vec2[];

  const divide: (xyz: vec3, size: vec2) => vec3[] = (xyz, [width, height]) => {
    const [x, y, z] = xyz;
    if (z > 22) return [xyz];

    const clip = corners.map((_) => project(_, xyz));

    if (
      clip.every(([x, , , w]) => x > Math.abs(w)) ||
      clip.every(([x, , , w]) => x < -Math.abs(w)) ||
      clip.every(([, y, , w]) => y > Math.abs(w)) ||
      clip.every(([, y, , w]) => y < -Math.abs(w)) ||
      clip.every(([, , z, w]) => z > Math.abs(w)) ||
      clip.every(([, , z, w]) => z < -Math.abs(w)) ||
      clip.every(([, , , w]) => w < 0)
    )
      return [];

    const pixels = clip.map(clipToScreen);
    allPixels.push(...pixels);
    const l = Math.sqrt(
      [0, 1, 2, 3]
        .map((i) => {
          const [x1, y1] = pixels[i];
          const [x2, y2] = pixels[(i + 1) % pixels.length];
          return (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
        })
        .reduce((a, b) => a + b, 0) / 4
    );
    if (l > 256 * 2) {
      const divided: vec3[] = [
        [2 * x, 2 * y, z + 1],
        [2 * x + 1, 2 * y, z + 1],
        [2 * x, 2 * y + 1, z + 1],
        [2 * x + 1, 2 * y + 1, z + 1],
      ];
      const next = divided.flatMap((_) => divide(_, [width, height]));
      if (divided.some((_) => !getTile(_).loaded)) return [xyz];
      return next;
    } else return [xyz];
  };

  const recenter = (anchor: Anchor) => {
    const { screen, world } = anchor;

    const [x, y] = screenToClip(screen);
    const [ax, ay, az] = clipToLocal([x, y, 100, 1]);
    const [bx, by, bz] = clipToLocal([x, y, -100, 1]);
    const distance = vec3.distance(mercator(camera), mercator(world));

    const [t1] = quadratic(
      (bx - ax) * (bx - ax) + (by - ay) * (by - ay) + (bz - az) * (bz - az),
      ax * (bx - ax) + ay * (by - ay) + az * (bz - az),
      ax * ax + ay * ay + az * az - distance * distance
    );

    const local: vec3 = [
      ax + t1 * (bx - ax),
      ay + t1 * (by - ay),
      az + t1 * (bz - az),
    ];

    camera = geodetic(vec3.sub(vector, mercator(world), local));
  };

  const render = ({
    depth,
    width,
    height,
  }: {
    width: number;
    height: number;
    depth?: boolean;
  }) => {
    const [, , z] = camera;
    const [, , near] = mercator([0, 0, z / 100]);
    const [, , far] = mercator([0, 0, 1000 * z]);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.viewport(0, 0, width, height);

    mat4.identity(projection);
    mat4.perspective(
      projection,
      (45 * Math.PI) / 180,
      width / height,
      near,
      far
    );

    mat4.identity(modelView);
    mat4.scale(modelView, modelView, [1, -1, 1]);

    mat4.rotateX(modelView, modelView, pitch);
    mat4.rotateZ(modelView, modelView, bearing);

    if (anchor && !depth) recenter(anchor);

    allPixels = [];
    const tiles = divide([0, 0, 0], [width, height]);

    if (depth) {
      const uvwAttribute = gl.getAttribLocation(depthProgram, "uvw");
      const projectionUniform = gl.getUniformLocation(
        depthProgram,
        "projection"
      );
      const modelViewUniform = gl.getUniformLocation(depthProgram, "modelView");
      const terrainUniform = gl.getUniformLocation(depthProgram, "terrain");
      const xyzUniform = gl.getUniformLocation(depthProgram, "xyz");
      const cameraUniform = gl.getUniformLocation(depthProgram, "camera");

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, uvwBuffer);
      gl.vertexAttribPointer(uvwAttribute, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(uvwAttribute);

      gl.useProgram(depthProgram);
      gl.uniform1i(terrainUniform, 0);
      gl.uniformMatrix4fv(projectionUniform, false, projection);
      gl.uniformMatrix4fv(modelViewUniform, false, modelView);
      gl.uniform3iv(cameraUniform, [...to(mercator(camera))]);

      for (const xyz of tiles) {
        const { terrain } = getTile(xyz);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, terrain);
        gl.uniform3iv(xyzUniform, [...xyz]);

        gl.drawElements(gl.TRIANGLES, n * n * 2 * 3, gl.UNSIGNED_SHORT, 0);
      }
    } else {
      /*context.clearRect(0, 0, width, height);
      context.fillStyle = "red";
      allPixels.forEach(([x, y]) =>
        context.fillRect(x * 2 - 5, y * 2 - 5, 10, 10)
      );*/
      const uvwAttribute = gl.getAttribLocation(renderProgram, "uvw");
      const projectionUniform = gl.getUniformLocation(
        renderProgram,
        "projection"
      );
      const modelViewUniform = gl.getUniformLocation(
        renderProgram,
        "modelView"
      );
      const imageryUniform = gl.getUniformLocation(renderProgram, "imagery");
      const terrainUniform = gl.getUniformLocation(renderProgram, "terrain");
      const xyzUniform = gl.getUniformLocation(renderProgram, "xyz");
      const cameraUniform = gl.getUniformLocation(renderProgram, "camera");

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, uvwBuffer);
      gl.vertexAttribPointer(uvwAttribute, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(uvwAttribute);

      gl.useProgram(renderProgram);
      gl.uniform1i(imageryUniform, 0);
      gl.uniform1i(terrainUniform, 1);
      gl.uniformMatrix4fv(projectionUniform, false, projection);
      gl.uniformMatrix4fv(modelViewUniform, false, modelView);
      gl.uniform3iv(cameraUniform, [...to(mercator(camera))]);

      for (const xyz of tiles) {
        const { imagery, terrain } = getTile(xyz);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, imagery);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, terrain);
        gl.uniform3iv(xyzUniform, [...xyz]);

        gl.drawElements(gl.TRIANGLES, n * n * 2 * 3, gl.UNSIGNED_SHORT, 0);
      }
    }
  };

  const frame = () => {
    const { innerWidth, innerHeight, devicePixelRatio } = window;
    const width = innerWidth * devicePixelRatio;
    const height = innerHeight * devicePixelRatio;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    if (canvas2.width !== width) canvas2.width = width;
    if (canvas2.height !== height) canvas2.height = height;
    render({ width, height });

    requestAnimationFrame(frame);
  };

  const buffer = new Uint8Array(4);
  const pick = ([screenX, screenY]: vec2) => {
    const scale = 0.5;
    const { innerWidth, innerHeight } = window;
    const width = Math.floor(innerWidth * scale);
    const height = Math.floor(innerHeight * scale);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    render({
      width,
      height,
      depth: true,
    });
    gl.readPixels(
      screenX * scale,
      (innerHeight - screenY) * scale,
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      buffer
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const [r, g] = buffer;
    const depth = (r * 256 + g) / (256 * 256 - 1);
    const z = 2 * depth - 1;
    const [x, y] = screenToClip([screenX, screenY]);
    return localToWorld(clipToLocal([x, y, z, 1]));
  };

  const screenToClip = ([screenX, screenY]: vec2) => {
    const x = (2 * screenX) / window.innerWidth - 1;
    const y = -((2 * screenY) / window.innerHeight - 1);
    return [x, y, 0, 1] as vec4;
  };

  const clipToScreen: (v: vec4) => vec2 = ([x, y, , w]) =>
    [
      (x / Math.abs(w) + 1) * window.innerWidth * 0.5,
      (1 - y / Math.abs(w)) * window.innerHeight * 0.5,
    ] as vec2;

  const clipToLocal = (v: vec4) => {
    const transform = mat4.multiply(matrix, projection, modelView);
    const inverse = mat4.invert(matrix, transform);
    const [x, y, z, w] = vec4.transformMat4(vec4.create(), v, inverse);
    return [x / Math.abs(w), y / Math.abs(w), z / Math.abs(w)] as vec3;
  };

  const localToClip = ([x, y, z]: vec3) => {
    const transform = mat4.multiply(matrix, projection, modelView);
    return vec4.transformMat4(vec4.create(), [x, y, z, 1], transform);
  };

  const localToWorld = ([x, y, z]: vec3) => {
    const [cx, cy, cz] = mercator(camera);
    return geodetic([x + cx, y + cy, z + cz]);
  };

  requestAnimationFrame(frame);
};

start();
