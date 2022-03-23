import { glMatrix, mat4, quat, vec2, vec3, vec4 } from "gl-matrix";
import * as LruCache from "lru-cache";
import depthSource from "./depth.glsl";
import renderSource from "./render.glsl";
import vertexSource from "./vertex.glsl";

/**
 * TODO:
 * - mouse drag and zoom
 * - sphere projection
 * - smooth transition
 */
const imageryUrl = "http://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}";
const terrainUrl =
  "https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoiZ3JhaGFtZ2liYm9ucyIsImEiOiJja3Qxb3Q5bXQwMHB2MnBwZzVyNzgyMnZ6In0.4qLjlbLm6ASuJ5v5gN6FHQ";
const n = 20;
const z0 = 0;
const ONE = 1073741824; // 2^30
const CIRCUMFERENCE = 40075017;
let center: vec3 = [-121.696, 45.3736, 3000];
let altitude = 8000;

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

const geodetic = ([x, y, z]: vec3) =>
  [
    x * 360,
    (Math.atan(Math.sinh(-y * (2 * Math.PI))) * 180) / Math.PI,
    z * CIRCUMFERENCE,
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
  elevation: number;
  dispose: () => void;
}

const start = () => {
  const canvas = document.querySelector<HTMLCanvasElement>("#canvas");
  if (!canvas) return;

  const projection = mat4.create();
  const modelView = mat4.create();
  mat4.identity(modelView);
  mat4.translate(modelView, modelView, mercator([0, 0, -altitude]));

  mat4.rotateX(modelView, modelView, -(1 / 180) * Math.PI);
  //mat4.rotateZ(modelView, modelView, (27 * Math.PI) / 180);

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  let orbit: vec3 | undefined;
  canvas.addEventListener("mousedown", ({ buttons, x, y }) => {
    orbit = pick([x, y]);
  });

  canvas.addEventListener("mouseup", ({ buttons }) => {
    orbit = undefined;
  });

  canvas.addEventListener(
    "mousemove",
    ({ buttons, movementX, movementY, x, y }) => {
      if (!orbit) return;
      if (buttons === 1) {
        const q = pick([x, y]);
        const [cx, cy, cz] = center;
        const [dx, dy] = vec3.sub(vec3.create(), orbit, q);
        center = [cx + dx, cy + dy, cz];
      }
      if (buttons === 2) {
        const rotation = mat4.getRotation(quat.create(), modelView);

        /*const r = vec3.transformQuat(
          vec3.create(),
          vec3.sub(vec3.create(), mercator(orbit), mercator(center)),
          quat.invert(quat.create(), rotation)
        );*/

        // v * P * T1 * R1 * R2^-1 = v * P * T2

        // (o-c1) * P * M1 = (o-c2) * P * M2
        // c1 * P * R1 = c2 * P * R2
        // c2 = c1 * P * M1 * M2 ^ -1 * P^-1

        // (o-c1) * P * M1 * (P * M2) ^ -1 = (o-c2)
        //mat4.translate(modelView, modelView, vec3.scale(vec3.create(), r, -1));

        const deltaBearing = (movementX / window.innerHeight) * Math.PI;
        const deltaPitch = (movementY / window.innerWidth) * Math.PI;

        const transform = mat4.identity(mat4.create());
        mat4.rotate(transform, transform, deltaBearing, [0, 0, 1]);
        mat4.rotate(
          transform,
          transform,
          deltaPitch,
          vec3.transformQuat(
            vec3.create(),
            [1, 0, 0],
            quat.invert(quat.create(), rotation)
          )
        );

        const clip = localToClip(worldToLocal(orbit));

        mat4.mul(modelView, modelView, transform);

        const q = localToWorld(clipToLocal(clip));

        vec3.add(center, center, vec3.sub(vec3.create(), q, orbit));

        console.log(center);

        /*const modelView2 = mat4.mul(mat4.create(), modelView, transform);
        const test = mat4.mul(
          mat4.create(),
          mat4.mul(mat4.create(), projection, modelView),
          mat4.invert(
            mat4.create(),
            mat4.mul(mat4.create(), projection, modelView2)
          )
        );
        //mat4.mul(modelView, modelView, transform);
        const center2 = vec3.sub(
          vec3.create(),
          mercator(orbit),
          vec3.transformMat4(
            vec3.create(),
            vec3.sub(vec3.create(), mercator(center), mercator(center)),
            test
          )
        );*/

        //console.log(localToClip(worldToLocal(pick([x, y]))));
      }
    }
  );

  canvas.addEventListener("click", ({ x, y }) => pick([x, y]));

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
  });

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
    onLoad,
    onError,
  }: {
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

  let tiles = new LruCache<string, Tile>({
    max: 1000,
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
    let elevation = 0;
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

    const tile: Tile = {
      imagery,
      terrain,
      get loaded() {
        return imageryLoaded && terrainLoaded;
      },
      get elevation() {
        return elevation;
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
  const vector = vec3.create();
  const project = ([u, v]: vec2, [x, y, z]: vec3, elevation: number) => {
    const k = Math.pow(2, -z);
    const [cx, cy, cz] = mercator(vec3.sub(vector, center, [0, 0, elevation]));
    const [tx, ty, tz] = [
      (x + u) * k - 0.5 - cx,
      -((y + v) * k - 0.5 - cy),
      -cz,
    ] as vec3;
    return localToClip([tx, ty, tz]);
  };

  const corners: vec2[] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const divide: (xyz: vec3, size: vec2) => vec3[] = (xyz, [width, height]) => {
    const [x, y, z] = xyz;
    if (z > 22) return [xyz];

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
      [0, 1, 2, 3]
        .map((i) => {
          const [x1, y1] = pixels[i];
          const [x2, y2] = pixels[(i + 1) % pixels.length];
          return x1 * y2 - x2 * y1;
        })
        .reduce((a, b) => a + b, 0) * 0.5;

    if (
      area >
      256 * 256 * window.devicePixelRatio * window.devicePixelRatio * 16
    ) {
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

  const render = ({
    depth,
    width,
    height,
  }: {
    width: number;
    height: number;
    depth?: boolean;
  }) => {
    const [, , near] = mercator([0, 0, altitude / 100]);
    const [, , far] = mercator([0, 0, 100 * altitude]);

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
      const centerUniform = gl.getUniformLocation(depthProgram, "center");

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, uvwBuffer);
      gl.vertexAttribPointer(uvwAttribute, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(uvwAttribute);

      gl.useProgram(depthProgram);
      gl.uniform1i(terrainUniform, 0);
      gl.uniformMatrix4fv(projectionUniform, false, projection);
      gl.uniformMatrix4fv(modelViewUniform, false, modelView);
      gl.uniform3iv(centerUniform, [...to(mercator(center))]);

      for (const xyz of tiles) {
        const { terrain } = getTile(xyz);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, terrain);
        gl.uniform3iv(xyzUniform, [...xyz]);

        gl.drawElements(gl.TRIANGLES, n * n * 2 * 3, gl.UNSIGNED_SHORT, 0);
      }
    } else {
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
      const centerUniform = gl.getUniformLocation(renderProgram, "center");

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, uvwBuffer);
      gl.vertexAttribPointer(uvwAttribute, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(uvwAttribute);

      gl.useProgram(renderProgram);
      gl.uniform1i(imageryUniform, 0);
      gl.uniform1i(terrainUniform, 1);
      gl.uniformMatrix4fv(projectionUniform, false, projection);
      gl.uniformMatrix4fv(modelViewUniform, false, modelView);
      gl.uniform3iv(centerUniform, [...to(mercator(center))]);

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

  const frame = (now: number) => {
    const { innerWidth, innerHeight, devicePixelRatio } = window;
    const width = innerWidth * devicePixelRatio;
    const height = innerHeight * devicePixelRatio;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    render({ width, height });

    requestAnimationFrame(frame);
  };

  const buffer = new Uint8Array(4);
  const screenToClip = ([screenX, screenY]: vec2) => {
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

    const x = (2 * screenX) / window.innerWidth - 1;
    const y = -((2 * screenY) / window.innerHeight - 1);

    const [r, g] = buffer;
    const depth = (r * 256 + g) / (256 * 256 - 1);
    const z = 2 * depth - 1;
    return [x, y, z] as vec3;
  };

  const clipToLocal = ([x, y, z]: vec3) => {
    const transform = mat4.multiply(matrix, projection, modelView);
    const inverse = mat4.invert(matrix, transform);
    return vec3.transformMat4(vector, [x, -y, z], inverse);
  };

  const localToWorld = ([x, y, z]: vec3) => {
    const [cx, cy, cz] = mercator(center);
    return geodetic([x + cx, y + cy, z + cz]);
  };

  const worldToLocal = (v: vec3) =>
    vec3.sub(vector, mercator(v), mercator(center));

  const localToClip = ([x, y, z]: vec3) => {
    const transform = mat4.multiply(matrix, projection, modelView);
    const [tx, ty, tz, tw] = vec4.transformMat4(
      vec4.create(),
      [x, y, z, 1],
      transform
    );
    const l = Math.abs(tw); // TODO: Why?
    return [tx / l, -ty / l, tz / l] as vec3;
  };

  const pick = (screen: vec2) =>
    localToWorld(clipToLocal(screenToClip(screen)));

  requestAnimationFrame(frame);
};

start();

/**
 * Returns an euler angle representation of a quaternion
 * @param  {vec3} out Euler angles, pitch-yaw-roll
 * @param  {quat} mat Quaternion
 * @return {vec3} out
 */
export function getEuler(out: vec3, quat: quat): vec3 {
  let x = quat[0],
    y = quat[1],
    z = quat[2],
    w = quat[3],
    x2 = x * x,
    y2 = y * y,
    z2 = z * z,
    w2 = w * w;
  let unit = x2 + y2 + z2 + w2;
  let test = x * w - y * z;
  if (test > 0.499995 * unit) {
    //TODO: Use glmatrix.EPSILON
    // singularity at the north pole
    out[0] = Math.PI / 2;
    out[1] = 2 * Math.atan2(y, x);
    out[2] = 0;
  } else if (test < -0.499995 * unit) {
    //TODO: Use glmatrix.EPSILON
    // singularity at the south pole
    out[0] = -Math.PI / 2;
    out[1] = 2 * Math.atan2(y, x);
    out[2] = 0;
  } else {
    out[0] = Math.asin(2 * (x * z - w * y));
    out[1] = Math.atan2(2 * (x * w + y * z), 1 - 2 * (z2 + w2));
    out[2] = Math.atan2(2 * (x * y + z * w), 1 - 2 * (y2 + z2));
  }
  // TODO: Return them as degrees and not as radians
  return out;
}
