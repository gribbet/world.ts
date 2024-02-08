import { glMatrix, quat, vec2, vec3 } from "gl-matrix";
import { debounce } from "./common";
import { circumference } from "./constants";
import { Layer, createLineLayer, createTerrainLayer } from "./layers";
import { createMeshLayer } from "./layers/mesh";
import { Line } from "./line";
import { geodetic, mercator, quadratic } from "./math";
import { Mesh } from "./mesh";
import { createPickBuffer } from "./pick-buffer";
import { View, createViewport } from "./viewport";

glMatrix.setMatrixArrayType(Array);

export type World = {
  set view(view: View);
  get view(): View;
  set draggable(draggable: boolean);
  get draggable(): boolean;
  addLine: (line: Partial<Line>) => Line;
  addMesh: (mesh: Partial<Mesh>) => Mesh;
  destroy: () => void;
};

const pickScale = 0.5;
const minimumDistance = 2;

export const createWorld: (canvas: HTMLCanvasElement) => World = (canvas) => {
  let view: View = {
    target: [0, 0, 0],
    screen: [0, 0],
    distance: circumference,
    orientation: [0, 0, 0],
  };
  let draggable = true;

  const gl = canvas.getContext("webgl2", {
    antialias: true,
  }) as WebGL2RenderingContext;
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

  const clear = ([width, height]: vec2) => {
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  };

  const render = () => {
    let viewport = createViewport(view).scale(devicePixelRatio);
    clear(viewport.screen);
    layers.forEach((_) => _.render(viewport));
  };

  const depth = () => {
    let viewport = createViewport(view).scale(pickScale * devicePixelRatio);
    clear(viewport.screen);
    layers.forEach((_, i) => _.depth(viewport, i));
  };

  const frame = () => {
    render();
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);

  const pick = ([screenX, screenY]: vec2) => {
    const { screenToClip, clipToLocal, localToWorld } = createViewport(view);

    pickBuffer.use();
    depth();

    const [z, n] = pickBuffer.read([
      screenX * devicePixelRatio * pickScale,
      screenY * devicePixelRatio * pickScale,
    ]);

    const [x, y] = screenToClip([screenX, screenY]);
    const p = geodetic(localToWorld(clipToLocal([x, y, z, 1])));
    return [p, n] as const;
  };

  const destroy = () => {
    resizer.unobserve(canvas);
    // TODO: Destroy
  };

  const recenter = (center: vec2) => {
    const { camera } = createViewport(view);
    const [target] = pick(center);
    const distance = vec3.distance(mercator(target), camera) * circumference;
    view = {
      ...view,
      center,
      target,
      distance,
    };
  };

  canvas.addEventListener("mousedown", ({ x, y }) => {
    if (draggable) recenter([x, y]);
  });

  canvas.addEventListener(
    "mousemove",
    ({ buttons, movementX, movementY, x, y }) => {
      if (buttons === 1 && draggable) {
        view = {
          ...view,
          center: [x, y],
        };
      } else if (buttons === 2) {
        const {
          screen: [width, height],
          orientation: [pitch, yaw, roll],
        } = view;
        view.orientation = [
          pitch - (movementY / height) * Math.PI,
          yaw - (movementX / width) * Math.PI,
          roll,
        ];
      }
    }
  );

  let zooming = false;
  const clearZooming = debounce(() => (zooming = false), 10);

  canvas.addEventListener(
    "wheel",
    (event) => {
      const { x, y } = event;
      if (!zooming && draggable) {
        recenter([x, y]);
        zooming = true;
      }
      view = {
        ...view,
        distance: Math.min(
          Math.max(
            view.distance * Math.exp(event.deltaY * 0.001),
            minimumDistance
          ),
          circumference
        ),
      };
      clearZooming();
    },
    { passive: true }
  );

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

  const addMesh = (mesh: Partial<Mesh>) => {
    const layer = createMeshLayer(gl, {
      vertices: [],
      indices: [],
      position: [0, 0, 0],
      orientation: quat.identity(quat.create()),
      color: [1, 1, 1, 1],
      size: 1,
      ...mesh,
    });
    layers.push(layer);
    return layer;
  };

  return {
    get view() {
      return view;
    },
    set view(_view: View) {
      view = _view;
    },
    get draggable() {
      return draggable;
    },
    set draggable(_draggable: boolean) {
      draggable = _draggable;
    },
    addLine,
    addMesh,
    destroy,
  };
};
