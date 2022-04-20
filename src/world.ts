import { glMatrix, mat4, vec2, vec3, vec4 } from "gl-matrix";
import { debounce, range } from "./common";
import { circumference } from "./constants";
import depthSource from "./depth.glsl";
import { geodetic, mercator, quadratic } from "./math";
import renderSource from "./render.glsl";
import { tileShape } from "./tile-shape";
import { createTiles, Tiles } from "./tiles";
import vertexSource from "./vertex.glsl";

glMatrix.setMatrixArrayType(Array);

export interface World {
  destroy: () => void;
}

const matrix = mat4.create();

interface Anchor {
  screen: vec2;
  world: vec3;
  distance: number;
}

export const world: (canvas: HTMLCanvasElement) => World = (canvas) => {
  let bearing = 0;
  let pitch = 0;
  let anchor: Anchor | undefined;
  const pickScale = 0.25;

  let view: View = {
    projection: mat4.create(),
    modelView: mat4.create(),
    camera: mercator([0, 0, circumference]),
    width: 0,
    height: 0,
  };

  const gl = canvas.getContext("webgl") as WebGL2RenderingContext;
  if (!gl) throw new Error("WebGL context failure");

  const tileLayer = createTileLayer(gl);

  const pickBuffer = createPickBuffer(gl);

  const resize = (width: number, height: number) => {
    view.width = width;
    view.height = height;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    pickBuffer.resize([width * pickScale, height * pickScale]);
  };

  resize(canvas.clientWidth, canvas.clientHeight);

  const resizer = new ResizeObserver(([{ contentRect }]) => {
    const { width, height } = contentRect;
    resize(width, height);
  });
  resizer.observe(canvas);

  const render = ({ depth }: { depth?: boolean } = {}) => {
    const scale = depth ? pickScale : devicePixelRatio;
    const width = view.width * scale;
    const height = view.height * scale;

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.viewport(0, 0, width, height);

    if (depth) {
      tileLayer.depth({
        ...view,
        width,
        height,
      });
    } else {
      tileLayer.render({
        ...view,
        width,
        height,
      });
    }
  };

  const frame = () => {
    setupMatrices();

    if (anchor) recenter(anchor);

    render();

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);

  const setupMatrices = () => {
    const { projection, modelView, camera, width, height } = view;

    const [, , z] = camera;
    const near = z / 100;
    const far = 100 * z;
    mat4.identity(projection);
    mat4.perspective(
      projection,
      (45 * Math.PI) / 180,
      width / height,
      near,
      far
    );
    mat4.scale(projection, projection, [1, -1, 1]);

    mat4.identity(modelView);
    mat4.rotateX(modelView, modelView, pitch);
    mat4.rotateZ(modelView, modelView, bearing);
  };

  const recenter = (anchor: Anchor) => {
    const { screen, world, distance } = anchor;
    const { screenToClip, clipToLocal } = viewport(view);

    const [x, y] = screenToClip(screen);
    const [ax, ay, az] = clipToLocal([x, y, -100, 1]);
    const [bx, by, bz] = clipToLocal([x, y, 100, 1]);

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

    view.camera = vec3.sub(vec3.create(), mercator(world), local);
  };

  const pick = ([screenX, screenY]: vec2) => {
    const { screenToClip, clipToLocal, localToWorld } = viewport(view);

    pickBuffer.bind();
    render({ depth: true });
    pickBuffer.unbind();

    const z = pickBuffer.depth([screenX * pickScale, screenY * pickScale]);

    const [x, y] = screenToClip([screenX, screenY]);
    return geodetic(localToWorld(clipToLocal([x, y, z, 1])));
  };

  const destroy = () => {
    resizer.unobserve(canvas);
    // TODO: Destroy
  };

  const mouseAnchor: (screen: vec2) => Anchor = (screen) => {
    const { camera } = view;
    const world = pick(screen);
    const distance = vec3.distance(mercator(world), camera);
    return {
      screen,
      world,
      distance,
    };
  };

  const clearAnchor = debounce(() => {
    anchor = undefined;
  }, 100);

  canvas.addEventListener("mousedown", ({ x, y }) => {
    anchor = mouseAnchor([x, y]);
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
        const { width, height } = view;
        bearing -= (movementX / width) * Math.PI;
        pitch = Math.min(
          0.5 * Math.PI,
          Math.max(0, pitch - (movementY / height) * Math.PI)
        );
      }
    }
  );

  canvas.addEventListener("mouseup", clearAnchor);

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const { x, y } = event;
    if (!anchor) anchor = mouseAnchor([x, y]);
    anchor = {
      ...anchor,
      distance: anchor.distance * Math.exp(event.deltaY * 0.001),
    };
    clearAnchor();
  });

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  return {
    destroy,
  };
};

const calculateVisibleTiles = (view: View) => {
  const { width, height } = view;
  const { worldToLocal, localToClip, clipToScreen } = viewport(view);

  const divide: (xyz: vec3, size: vec2) => vec3[] = (xyz, [width, height]) => {
    const [x, y, z] = xyz;

    const clip = tileShape(xyz)?.map(worldToLocal).map(localToClip);
    if (
      !clip ||
      clip.every(([x, , , w]) => x > w) ||
      clip.every(([x, , , w]) => x < -w) ||
      clip.every(([, y, , w]) => y > w) ||
      clip.every(([, y, , w]) => y < -w) ||
      clip.every(([, , z, w]) => z > w) ||
      clip.every(([, , z, w]) => z < -w) ||
      clip.every(([, , , w]) => w < 0)
    )
      return [];

    const pixels = clip.map(clipToScreen);
    const size = Math.sqrt(
      [0, 1, 2, 3]
        .map((i) =>
          vec2.squaredDistance(pixels[i], pixels[(i + 1) % pixels.length])
        )
        .reduce((a, b) => a + b, 0) / 4
    );
    if (size > 256 * 2 && z < 22) {
      const divided: vec3[] = [
        [2 * x, 2 * y, z + 1],
        [2 * x + 1, 2 * y, z + 1],
        [2 * x, 2 * y + 1, z + 1],
        [2 * x + 1, 2 * y + 1, z + 1],
      ];

      const next = divided.flatMap((_) => divide(_, [width, height]));

      if (divided.some((_) => !tileShape(_))) return [xyz];

      return next;
    } else return [xyz];
  };

  return divide([0, 0, 0], [width, height]);
};

interface PickBuffer {
  bind: () => void;
  unbind: () => void;
  resize: (size: vec2) => void;
  depth: (pixel: vec2) => number;
  destroy: () => void;
}

const createPickBuffer: (gl: WebGLRenderingContext) => PickBuffer = (gl) => {
  const targetTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, targetTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const depthBuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer); // TODO:
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);

  const framebuffer = gl.createFramebuffer();

  const bind = () => gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  const unbind = () => gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  bind();
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
  unbind();

  let height = 0;
  const resize = ([width, _height]: vec2) => {
    height = _height;
    gl.bindTexture(gl.TEXTURE_2D, targetTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
    gl.renderbufferStorage(
      gl.RENDERBUFFER,
      gl.DEPTH_COMPONENT16,
      width,
      height
    );
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  };

  const buffer = new Uint8Array(4);
  const depth = ([x, y]: vec2) => {
    bind();
    gl.readPixels(x, height - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
    unbind();

    const [r, g] = buffer;
    const zo = (r * 256 + g) / (256 * 256 - 1);
    const z = 2 * zo - 1;

    return z;
  };

  const destroy = () => {
    // TODO:
  };

  return {
    bind,
    unbind,
    resize,
    depth,
    destroy,
  };
};

interface View {
  projection: mat4;
  modelView: mat4;
  camera: vec3;
  width: number;
  height: number;
}

interface Viewport {
  screenToClip: (_: vec2) => vec4;
  clipToScreen: (_: vec4) => vec2;
  clipToLocal: (_: vec4) => vec3;
  localToClip: (_: vec3) => vec4;
  localToWorld: (_: vec3) => vec3;
  worldToLocal: (_: vec3) => vec3;
}

const viewport: (view: View) => Viewport = ({
  projection,
  modelView,
  camera,
  width,
  height,
}) => {
  const screenToClip = ([screenX, screenY]: vec2) => {
    const x = (2 * screenX) / width - 1;
    const y = -((2 * screenY) / height - 1);
    return [x, y, 0, 1] as vec4;
  };

  const clipToScreen: (v: vec4) => vec2 = ([x, y, , w]) =>
    [(x / w + 1) * width * 0.5, (1 - y / w) * height * 0.5] as vec2;

  const clipToLocal = (v: vec4) => {
    const transform = mat4.multiply(matrix, projection, modelView);
    const inverse = mat4.invert(matrix, transform);
    const [x, y, z, w] = vec4.transformMat4(vec4.create(), v, inverse);
    return [x / w, y / w, z / w] as vec3;
  };

  const localToClip = ([x, y, z]: vec3) => {
    const transform = mat4.multiply(matrix, projection, modelView);
    return vec4.transformMat4(vec4.create(), [x, y, z, 1], transform);
  };

  const localToWorld = ([x, y, z]: vec3) => {
    const [cx, cy, cz] = camera;
    return [x + cx, y + cy, z + cz] as vec3;
  };

  const worldToLocal = ([x, y, z]: vec3) => {
    const [cx, cy, cz] = camera;
    return [x - cx, y - cy, z - cz] as vec3;
  };

  return {
    screenToClip,
    clipToScreen,
    clipToLocal,
    localToClip,
    localToWorld,
    worldToLocal,
  };
};

interface Program {
  execute: (view: View) => void;
  destroy: () => void;
}

interface Layer {
  render: (view: View) => void;
  depth: (view: View) => void;
  destroy: () => void;
}

const one = 1073741824; // 2^30
const to = ([x, y, z]: vec3) =>
  [Math.floor(x * one), Math.floor(y * one), Math.floor(z * one)] as vec3;

const n = 16;

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

const skirt = 0.1;
const uvw = range(0, n + 1).flatMap((y) =>
  range(0, n + 1).flatMap((x) => {
    let u = (x - 1) / (n - 2);
    let v = (y - 1) / (n - 2);
    let w = 0;
    if (x === 0) {
      u = 0;
      w = -skirt;
    }
    if (x === n) {
      u = 1;
      w = -skirt;
    }
    if (y === 0) {
      v = 0;
      w = -skirt;
    }
    if (y === n) {
      v = 1;
      w = -skirt;
    }

    return [u, v, w];
  })
);

const createTileLayer: (gl: WebGLRenderingContext) => Layer = (gl) => {
  const tiles = createTiles(gl);

  const uvwBuffer = gl.createBuffer();
  if (!uvwBuffer) throw new Error("Buffer creation failed");
  gl.bindBuffer(gl.ARRAY_BUFFER, uvwBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvw), gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  if (!indexBuffer) throw new Error("Buffer creation failed");
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indices),
    gl.STATIC_DRAW
  );

  const renderProgram = createRenderProgram({
    gl,
    tiles,
    uvwBuffer,
    indexBuffer,
  });

  const depthProgram = createDepthProgram({
    gl,
    tiles,
    uvwBuffer,
    indexBuffer,
  });

  const render = (view: View) => renderProgram.execute(view);

  const depth = (view: View) => depthProgram.execute(view);

  const destroy = () => {
    // TODO:
  };

  return { render, depth, destroy };
};

const createRenderProgram: (_: {
  gl: WebGLRenderingContext;
  tiles: Tiles;
  uvwBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
}) => Program = ({ gl, tiles, uvwBuffer, indexBuffer }) => {
  const program = gl.createProgram();
  if (!program) throw new Error("Program creation failed");
  gl.attachShader(program, loadShader(gl, "vertex", vertexSource));
  gl.attachShader(program, loadShader(gl, "fragment", renderSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Link failure", gl.getProgramInfoLog(program));
    throw new Error("Link failure");
  }

  const uvwAttribute = gl.getAttribLocation(program, "uvw");
  const projectionUniform = gl.getUniformLocation(program, "projection");
  const modelViewUniform = gl.getUniformLocation(program, "modelView");
  const imageryUniform = gl.getUniformLocation(program, "imagery");
  const terrainUniform = gl.getUniformLocation(program, "terrain");
  const downsampleImageryUniform = gl.getUniformLocation(
    program,
    "downsampleImagery"
  );
  const downsampleTerrainUniform = gl.getUniformLocation(
    program,
    "downsampleTerrain"
  );
  const xyzUniform = gl.getUniformLocation(program, "xyz");
  const cameraUniform = gl.getUniformLocation(program, "camera");

  const execute = (view: View) =>
    tiles.cancelUnused(() => {
      const { projection, modelView, camera } = view;
      const visible = calculateVisibleTiles(view);

      gl.enable(gl.DEPTH_TEST);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, uvwBuffer);
      gl.vertexAttribPointer(uvwAttribute, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(uvwAttribute);

      gl.useProgram(program);
      gl.uniform1i(imageryUniform, 0);
      gl.uniform1i(terrainUniform, 1);
      gl.uniformMatrix4fv(projectionUniform, false, projection);
      gl.uniformMatrix4fv(modelViewUniform, false, modelView);
      gl.uniform3iv(cameraUniform, [...to(camera)]);

      for (const xyz of visible) {
        const { texture: imagery, downsample: downsampleImagery } =
          tiles.imagery(xyz);
        const { texture: terrain, downsample: downsampleTerrain } =
          tiles.terrain(xyz);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, imagery);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, terrain);
        gl.uniform1i(downsampleImageryUniform, downsampleImagery);
        gl.uniform1i(downsampleTerrainUniform, downsampleTerrain);
        gl.uniform3iv(xyzUniform, [...xyz]);

        gl.drawElements(gl.TRIANGLES, n * n * 2 * 3, gl.UNSIGNED_SHORT, 0);
      }
    });

  const destroy = () => {
    // TODO:
  };

  return { execute, destroy };
};

const createDepthProgram: (_: {
  gl: WebGLRenderingContext;
  tiles: Tiles;
  uvwBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
}) => Program = ({ gl, tiles, uvwBuffer, indexBuffer }) => {
  const program = gl.createProgram();
  if (!program) throw new Error("Program creation failed");
  gl.attachShader(program, loadShader(gl, "vertex", vertexSource));
  gl.attachShader(program, loadShader(gl, "fragment", depthSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Link failure", gl.getProgramInfoLog(program));
    throw new Error("Link failure");
  }

  const uvwAttribute = gl.getAttribLocation(program, "uvw");
  const projectionUniform = gl.getUniformLocation(program, "projection");
  const modelViewUniform = gl.getUniformLocation(program, "modelView");
  const terrainUniform = gl.getUniformLocation(program, "terrain");
  const downsampleUniform = gl.getUniformLocation(program, "downsample");
  const xyzUniform = gl.getUniformLocation(program, "xyz");
  const cameraUniform = gl.getUniformLocation(program, "camera");

  const execute = (view: View) =>
    tiles.cancelUnused(() => {
      const { projection, modelView, camera } = view;
      const visible = calculateVisibleTiles(view);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, uvwBuffer);
      gl.vertexAttribPointer(uvwAttribute, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(uvwAttribute);

      gl.useProgram(program);
      gl.uniform1i(terrainUniform, 0);
      gl.uniformMatrix4fv(projectionUniform, false, projection);
      gl.uniformMatrix4fv(modelViewUniform, false, modelView);
      gl.uniform3iv(cameraUniform, [...to(camera)]);

      for (const xyz of visible) {
        const { texture: terrain, downsample } = tiles.terrain(xyz);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, terrain);
        gl.uniform1i(downsampleUniform, downsample);
        gl.uniform3iv(xyzUniform, [...xyz]);

        gl.drawElements(gl.TRIANGLES, n * n * 2 * 3, gl.UNSIGNED_SHORT, 0);
      }
    });

  const destroy = () => {
    // TODO:
  };

  return { execute, destroy };
};

const loadShader = (
  gl: WebGLRenderingContext,
  type: "vertex" | "fragment",
  source: string
) => {
  const shader = gl.createShader(
    type === "vertex" ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER
  );
  if (!shader) throw new Error("Shader creation failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Compilation failed", gl.getShaderInfoLog(shader));
    throw new Error("Compilation failure");
  }

  return shader;
};
