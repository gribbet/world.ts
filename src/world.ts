import type { vec2 } from "gl-matrix";
import { glMatrix, vec3 } from "gl-matrix";

import { createDepthBuffer } from "./depth-buffer";
import type { Billboard, Layer, Line, Mesh, Polygon, Terrain } from "./layers";
import { type BillboardLayer, createBillboardLayer } from "./layers/billboard";
import type { LineLayer } from "./layers/line";
import { createLineLayer } from "./layers/line";
import type { MeshLayer } from "./layers/mesh";
import { createMeshLayer } from "./layers/mesh";
import type { PolygonLayer } from "./layers/polygon";
import { createPolygonLayer } from "./layers/polygon";
import { createTerrainLayer, type TerrainLayer } from "./layers/terrain";
import { circumference, geodetic, mercator } from "./math";
import type { View } from "./model";
import { createViewport } from "./viewport";

glMatrix.setMatrixArrayType(Array); // Required for precision

type Pick = {
  screen: vec2;
  position: vec3;
  layer: Layer | undefined;
};

export type World = {
  readonly canvas: HTMLCanvasElement;
  set view(_: View);
  get view(): View;
  addTerrain: (_: Partial<Terrain>) => TerrainLayer;
  addLine: (_: Partial<Line>) => LineLayer;
  addPolygon: (_: Partial<Polygon>) => PolygonLayer;
  addMesh: (_: Partial<Mesh>) => MeshLayer;
  addBillboard: (_: Partial<Billboard>) => BillboardLayer;
  project: (_: vec3) => vec2;
  unproject: (_: vec2) => vec3;
  recenter: ([x, y]: [number, number]) => void;
  pick: ([x, y]: [number, number]) => Pick;
  dispose: () => void;
};

const depthScale = 0.25;

export const createWorld = (canvas: HTMLCanvasElement) => {
  let running = true;
  let view: View = {
    target: [0, 0, 0],
    screen: [0, 0],
    offset: [0, 0],
    distance: circumference,
    orientation: [0, 0, 0],
    fieldOfView: 45,
  };

  const gl = canvas.getContext("webgl2", {
    antialias: true,
  });
  if (!gl) throw new Error("No WebGL2");

  let layers: Layer[] = [];

  const depthBuffer = createDepthBuffer(gl);

  const resize = (screen: vec2) => {
    let [width = 0, height = 0] = screen;
    width = width || 1;
    height = height || 1;
    view.screen = [width, height];
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
    gl.viewport(0, 0, width * devicePixelRatio, height * devicePixelRatio);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  };

  const render = () => {
    const viewport = createViewport(view);
    clear(viewport.screen);

    layers.forEach(_ => _.render({ viewport }));
  };

  const depth = () => {
    const viewport = createViewport(view).scale(depthScale);
    clear(viewport.screen);
    layers.forEach((_, i) => _.render({ viewport, depth: true, index: i + 1 }));
  };

  const frame = () => {
    if (!running) return;
    render();
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);

  const project = (_: vec3) => {
    const { worldToLocal, localToClip, clipToScreen } = createViewport(view);
    return clipToScreen(localToClip(worldToLocal(mercator(_))));
  };

  const unproject = (_: vec2) => {
    const { localToWorld, clipToLocal, screenToClip } = createViewport(view);
    return geodetic(localToWorld(clipToLocal(screenToClip(_))));
  };

  const pick = (screen: vec2) => {
    const [screenX = 0, screenY = 0] = screen;
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

    return { screen, position, layer };
  };

  const recenter = ([cx = 0, cy = 0]: vec2) => {
    const { camera, fieldScale } = createViewport(view);
    const { position: target, layer } = pick([cx, cy]);
    if (!layer) return;
    const distance =
      (vec3.distance(mercator(target), camera) * circumference) / fieldScale;
    const [width = 0, height = 0] = view.screen;
    const offset: vec2 = [cx - width / 2, cy - height / 2];
    view = {
      ...view,
      offset,
      target,
      distance,
    };
  };

  const add = <T extends Layer>(layer: T) => {
    const { dispose } = layer;
    layer.dispose = () => {
      layers = layers.filter(_ => _ !== layer);
      dispose();
    };
    layers = [...layers, layer];
    return layer;
  };
  const addTerrain = (terrain: Partial<Terrain>) =>
    add(createTerrainLayer(gl, terrain));
  const addLine = (line: Partial<Line>) => add(createLineLayer(gl, line));
  const addPolygon = (polygon: Partial<Polygon>) =>
    add(createPolygonLayer(gl, polygon));
  const addMesh = (mesh: Partial<Mesh>) => add(createMeshLayer(gl, mesh));
  const addBillboard = (billboard: Partial<Billboard>) =>
    add(createBillboardLayer(gl, billboard));

  const dispose = () => {
    running = false;
    resizer.unobserve(canvas);
    layers.forEach(_ => _.dispose());
    depthBuffer.dispose();
  };

  return {
    canvas,
    get view() {
      return view;
    },
    set view(_: View) {
      view = _;
    },
    addTerrain,
    addPolygon,
    addLine,
    addMesh,
    addBillboard,
    project,
    unproject,
    recenter,
    pick,
    dispose,
  } satisfies World;
};
