import { glMatrix, mat4, vec2, vec3, vec4 } from "gl-matrix";
import { debounce } from "./common";
import { circumference } from "./constants";
import {
  createLineLayer,
  createTerrainLayer,
  Layer,
  LineLayer,
} from "./layers";
import { Line } from "./line";
import { geodetic, mercator, quadratic } from "./math";
import { createPickBuffer } from "./pick-buffer";
import { View, createViewport } from "./viewport";

glMatrix.setMatrixArrayType(Array);

export interface World {
  set anchor(anchor: Anchor);
  addLine: (line: Partial<Line>) => Line;
  destroy: () => void;
}

interface Anchor {
  screen: vec2;
  world: vec3;
  distance: number;
}

export const createWorld: (canvas: HTMLCanvasElement) => World = (canvas) => {
  let anchor: Anchor | undefined;
  const pickScale = 0.5;
  const minimumDistance = 200;

  let view: View = {
    camera: [0.18364142064305536, 0.3759435476297003, 7.430314677337515e-5],
    screen: [0, 0],
    bearing: 0,
    pitch: 0,
  };

  const gl = canvas.getContext("webgl2") as WebGL2RenderingContext;
  if (!gl) throw new Error("WebGL context failure");

  let layers: Layer[] = [createTerrainLayer(gl)];

  const pickBuffer = createPickBuffer(gl);

  const resize = (screen: vec2) => {
    view.screen = screen;
    const [width, height] = screen;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    pickBuffer.resize([canvas.width * pickScale, canvas.height * pickScale]);
  };

  resize([canvas.clientWidth, canvas.clientHeight]);

  const resizer = new ResizeObserver(([{ contentRect }]) => {
    const { width, height } = contentRect;
    resize([width, height]);
  });
  resizer.observe(canvas);

  const scaleViewport = (scale: number) => {
    let [width, height] = view.screen;
    [width, height] = [width * scale, height * scale];
    let screen: vec2 = [width, height];

    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    return createViewport({ ...view, screen });
  };

  const render = () => {
    let viewport = scaleViewport(devicePixelRatio);
    layers.forEach((_) => _.render(viewport));
  };

  const depth = () => {
    let viewport = scaleViewport(pickScale * devicePixelRatio);
    layers.forEach((_) => _.depth(viewport));
  };

  const frame = () => {
    if (anchor) recenter(anchor);

    render();

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);

  const recenter = (anchor: Anchor) => {
    const { screen, world, distance } = anchor;
    const { screenToClip, clipToLocal } = createViewport(view);

    const [x, y] = screenToClip(screen);
    const [ax, ay, az] = clipToLocal([x, y, -10000, 1]);
    const [bx, by, bz] = clipToLocal([x, y, 10000, 1]);

    const [t1] = quadratic(
      (bx - ax) * (bx - ax) + (by - ay) * (by - ay) + (bz - az) * (bz - az),
      ax * (bx - ax) + ay * (by - ay) + az * (bz - az),
      ax * ax +
        ay * ay +
        az * az -
        (distance * distance) / circumference / circumference
    );

    const local: vec3 = [
      ax + t1 * (bx - ax),
      ay + t1 * (by - ay),
      az + t1 * (bz - az),
    ];

    view.camera = vec3.sub(vec3.create(), mercator(world), local);
  };

  const pick = ([screenX, screenY]: vec2) => {
    const { screenToClip, clipToLocal, localToWorld } = createViewport(view);

    pickBuffer.use(depth);

    const z = pickBuffer.read([
      screenX * devicePixelRatio * pickScale,
      screenY * devicePixelRatio * pickScale,
    ]);

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
    const distance = vec3.distance(mercator(world), camera) * circumference;
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
        const [width, height] = view.screen;
        view.bearing -= (movementX / width) * Math.PI;
        view.pitch = Math.min(
          0.5 * Math.PI,
          Math.max(0, view.pitch - (movementY / height) * Math.PI)
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
      distance: Math.max(
        Math.min(anchor.distance, minimumDistance),
        anchor.distance * Math.exp(event.deltaY * 0.001)
      ),
    };
    clearAnchor();
  });

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  const addLine = (line: Partial<Line>) => {
    const layer = createLineLayer(gl, {
      points: [],
      color: [1, 1, 1, 1],
      width: 1,
      ...line,
    });
    layers.push(layer);

    return layer;
  };

  return {
    set anchor(_anchor: Anchor) {
      anchor = _anchor;
    },
    addLine,
    destroy,
  };
};
