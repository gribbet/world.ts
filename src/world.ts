import type { vec2 } from "gl-matrix";
import { glMatrix, quat, vec3 } from "gl-matrix";

import { debounce } from "./common";
import { circumference } from "./constants";
import { createDepthBuffer } from "./depth-buffer";
import type { Layer, Line, Mesh, Terrain } from "./layers";
import { createLineLayer } from "./layers/line";
import { createMeshLayer } from "./layers/mesh";
import { createTerrainLayer } from "./layers/terrain";
import { geodetic, mercator } from "./math";
import type { View } from "./viewport";
import { createViewport } from "./viewport";
import { createSubscriber } from "./subscriber";

glMatrix.setMatrixArrayType(Array); // Required for precision

type Pick = {
  position: vec3;
  layer: Layer | undefined;
};

type PickHandler = (_: Pick) => void;

export type World = {
  set view(_: View);
  get view(): View;
  set draggable(_: boolean);
  get draggable(): boolean;
  addTerrain: (terrain: Partial<Terrain>) => Terrain;
  addMesh: (mesh: Partial<Mesh>) => Mesh;
  addLine: (line: Partial<Line>) => Line;
  pick: ([x, y]: [number, number]) => Pick;
  onMouseDown: (_: PickHandler) => void;
  onMouseUp: (_: PickHandler) => void;
  onMouseMove: (_: PickHandler) => void;
  destroy: () => void;
};

const depthScale = 0.5;
const minimumDistance = 2;

export const createWorld = (canvas: HTMLCanvasElement) => {
  let running = true;
  let view: View = {
    target: [0, 0, 0],
    screen: [0, 0],
    distance: circumference,
    orientation: [0, 0, 0],
  };
  let draggable = true;

  const gl = canvas.getContext("webgl2", {
    antialias: true,
  });
  if (!gl) throw new Error("No WebGL2");

  let layers: Layer[] = [];

  const depthBuffer = createDepthBuffer(gl);

  const resize = (screen: vec2) => {
    view.screen = screen;
    const [width = 0, height = 0] = screen;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    depthBuffer.resize([canvas.width * depthScale, canvas.height * depthScale]);
  };

  resize([canvas.clientWidth, canvas.clientHeight]);

  const resizer = new ResizeObserver(([entry]) => {
    if (!entry) return;
    const { contentRect } = entry;
    const { width, height } = contentRect;
    resize([width, height]);
  });
  resizer.observe(canvas);

  const clear = ([width = 0, height = 0]: vec2) => {
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  };

  const render = () => {
    const viewport = createViewport(view).scale(devicePixelRatio);
    clear(viewport.screen);
    layers.forEach(_ => _.render({ viewport }));
  };

  const depth = () => {
    const viewport = createViewport(view).scale(depthScale * devicePixelRatio);
    clear(viewport.screen);
    layers.forEach((_, i) => _.render({ viewport, depth: true, index: i + 1 }));
  };

  const frame = () => {
    if (!running) return;
    render();
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);

  const pick = ([screenX = 0, screenY = 0]: vec2) => {
    const { screenToClip, clipToLocal, localToWorld } = createViewport(view);

    depthBuffer.use();

    gl.disable(gl.BLEND);
    depth();

    const [z, index] = depthBuffer.read([
      screenX * devicePixelRatio * depthScale,
      screenY * devicePixelRatio * depthScale,
    ]);

    const [x = 0, y = 0] = screenToClip([screenX, screenY]);
    const position = geodetic(localToWorld(clipToLocal([x, y, z, 1])));

    const layer = index === 0 ? undefined : layers[index - 1];

    return { position, layer };
  };

  const recenter = (center: vec2) => {
    const { camera } = createViewport(view);
    const { position: target, layer } = pick(center);
    if (!layer) return;
    const distance = vec3.distance(mercator(target), camera) * circumference;
    view = {
      ...view,
      center,
      target,
      distance,
    };
  };

  const [onMouseDown, mouseDown] = createSubscriber<Pick>();
  const [onMouseUp, mouseUp] = createSubscriber<Pick>();
  const [onMouseMove, mouseMove] = createSubscriber<Pick>();

  const onCanvasMouseDown = ({ x, y }: MouseEvent) => {
    if (draggable) recenter([x, y]);
    mouseDown(pick([x, y]));
  };

  const onCanvasMouseUp = ({ x, y }: MouseEvent) => mouseUp(pick([x, y]));

  const onCanvasMouseMove = ({
    buttons,
    movementX,
    movementY,
    x,
    y,
  }: MouseEvent) => {
    if (buttons === 1 && draggable)
      view = {
        ...view,
        center: [x, y],
      };
    else if (buttons === 2) {
      const {
        screen: [width = 0, height = 0],
        orientation: [pitch, roll, yaw],
      } = view;
      view.orientation = [
        pitch - (movementY / height) * Math.PI,
        roll,
        yaw - (movementX / width) * Math.PI,
      ];
    }
    mouseMove(pick([x, y]));
  };

  let zooming = false;
  const clearZooming = debounce(() => (zooming = false), 100);

  const onWheel = ({ x, y, deltaY }: WheelEvent) => {
    if (!zooming && draggable) {
      recenter([x, y]);
      zooming = true;
    }
    const distance = Math.min(
      Math.max(view.distance * Math.exp(deltaY * 0.001), minimumDistance),
      circumference
    );
    view = {
      ...view,
      distance,
    };
    clearZooming();
  };

  const onContextMenu = (event: MouseEvent) => event.preventDefault();

  const addTerrain = (terrain: Partial<Terrain>) => {
    const layer = createTerrainLayer(gl, {
      terrainUrl: "",
      imageryUrl: "",
      ...terrain,
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
      pickable: true,
      ...mesh,
    });
    layers.push(layer);
    return layer;
  };

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

  canvas.addEventListener("mousedown", onCanvasMouseDown);
  canvas.addEventListener("mouseup", onCanvasMouseUp);
  canvas.addEventListener("mousemove", onCanvasMouseMove);
  canvas.addEventListener("wheel", onWheel, { passive: true });
  canvas.addEventListener("contextmenu", onContextMenu);

  const destroy = () => {
    running = false;
    resizer.unobserve(canvas);
    layers.forEach(_ => _.destroy());
    layers = [];
    depthBuffer.destroy();
    canvas.removeEventListener("mousedown", onCanvasMouseDown);
    canvas.removeEventListener("mouseup", onCanvasMouseUp);
    canvas.removeEventListener("mousemove", onCanvasMouseMove);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("contextmenu", onContextMenu);
  };

  return {
    get view() {
      return view;
    },
    set view(_: View) {
      view = _;
    },
    get draggable() {
      return draggable;
    },
    set draggable(_: boolean) {
      draggable = _;
    },
    addTerrain,
    addMesh,
    addLine,
    pick,
    onMouseDown,
    onMouseUp,
    onMouseMove,
    destroy,
  } satisfies World;
};
