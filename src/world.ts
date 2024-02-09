import type { vec2 } from "gl-matrix";
import { glMatrix, vec3 } from "gl-matrix";

import { circumference } from "./constants";
import { createDepthBuffer } from "./depth-buffer";
import type { Layer, Line, Mesh, Terrain } from "./layers";
import type { LineLayer } from "./layers/line";
import { createLineLayer } from "./layers/line";
import type { MeshLayer } from "./layers/mesh";
import { createMeshLayer } from "./layers/mesh";
import type { TerrainLayer } from "./layers/terrain";
import { createTerrainLayer } from "./layers/terrain";
import { geodetic, mercator } from "./math";
import { createSubscriber } from "./subscriber";
import type { View } from "./viewport";
import { createViewport } from "./viewport";

glMatrix.setMatrixArrayType(Array); // Required for precision

type Pick = {
  position: vec3;
  layer: Layer | undefined;
};

type PickHandler = (_: Pick) => void;

export type World = {
  set view(_: View);
  get view(): View;
  addTerrain: (_: Partial<Terrain>) => TerrainLayer;
  addMesh: (_: Partial<Mesh>) => MeshLayer;
  addLine: (_: Partial<Line>) => LineLayer;
  recenter: ([x, y]: [number, number]) => void;
  pick: ([x, y]: [number, number]) => Pick;
  onMouseDown: (_: PickHandler) => void;
  onMouseUp: (_: PickHandler) => void;
  onMouseMove: (_: PickHandler) => void;
  destroy: () => void;
};

const depthScale = 0.25;

export const createWorld = (canvas: HTMLCanvasElement) => {
  let running = true;
  let view: View = {
    target: [0, 0, 0],
    screen: [0, 0],
    distance: circumference,
    orientation: [0, 0, 0],
  };

  const gl = canvas.getContext("webgl2", {
    antialias: true,
  });
  if (!gl) throw new Error("No WebGL2");

  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.FRONT);

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

    depth();

    const [z, index] = depthBuffer.read([
      screenX * depthScale * devicePixelRatio,
      screenY * depthScale * devicePixelRatio,
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

  const onCanvasMouseDown = ({ x, y }: MouseEvent) => mouseDown(pick([x, y]));
  const onCanvasMouseUp = ({ x, y }: MouseEvent) => mouseUp(pick([x, y]));
  const onCanvasMouseMove = ({ x, y }: MouseEvent) => mouseMove(pick([x, y]));

  const addTerrain = (terrain: Partial<Terrain>) => {
    const layer = createTerrainLayer(gl, terrain);
    layers.push(layer);
    return layer;
  };

  const addMesh = (mesh: Partial<Mesh>) => {
    const layer = createMeshLayer(gl, mesh);
    layers.push(layer);
    return layer;
  };

  const addLine = (line: Partial<Line>) => {
    const layer = createLineLayer(gl, line);
    layers.push(layer);
    return layer;
  };

  canvas.addEventListener("mousedown", onCanvasMouseDown);
  canvas.addEventListener("mouseup", onCanvasMouseUp);
  canvas.addEventListener("mousemove", onCanvasMouseMove);

  const destroy = () => {
    running = false;
    resizer.unobserve(canvas);
    layers.forEach(_ => _.destroy());
    layers = [];
    depthBuffer.destroy();
    canvas.removeEventListener("mousedown", onCanvasMouseDown);
    canvas.removeEventListener("mouseup", onCanvasMouseUp);
    canvas.removeEventListener("mousemove", onCanvasMouseMove);
  };

  return {
    get view() {
      return view;
    },
    set view(_: View) {
      view = _;
    },
    addTerrain,
    addMesh,
    addLine,
    recenter,
    pick,
    onMouseDown,
    onMouseUp,
    onMouseMove,
    destroy,
  } satisfies World;
};
