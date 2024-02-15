import type { vec2 } from "gl-matrix";
import { glMatrix, vec3 } from "gl-matrix";

import { createDepthBuffer } from "./depth-buffer";
import type { Layer } from "./layers";
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
  readonly gl: WebGL2RenderingContext;
  set view(_: View);
  get view(): View;
  add: (layer: Layer) => void;
  remove: (layer: Layer) => void;
  project: (_: vec3) => vec2;
  unproject: (_: vec2) => vec3;
  recenter: ([x, y]: vec2) => void;
  pick: ([x, y]: vec2, layer?: Layer) => Pick;
  dispose: () => void;
};

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

  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.FRONT);

  let layers: Layer[] = [];

  const depthBuffer = createDepthBuffer(gl);

  const resize = (screen: vec2) => {
    let [width = 0, height = 0] = screen;
    width = width || 1;
    height = height || 1;
    view.screen = [width, height];
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    depthBuffer.resize([canvas.width, canvas.height]);
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

  const depth = (layer?: Layer) => {
    const viewport = createViewport(view);
    clear(viewport.screen);
    (layer ? [layer] : layers).forEach((_, i) =>
      _.render({ viewport, depth: true, index: i + 1 }),
    );
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

  const pick = (screen: vec2, pickLayer?: Layer) => {
    const [screenX = 0, screenY = 0] = screen;
    const { screenToClip, clipToLocal, localToWorld } = createViewport(view);

    depthBuffer.use();

    depth(pickLayer);

    const [z, index] = depthBuffer.read([
      screenX * devicePixelRatio,
      screenY * devicePixelRatio,
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

  const add = (layer: Layer) => {
    layers = [...layers, layer];
  };

  const remove = (layer: Layer) => {
    layers = layers.filter(_ => _ !== layer);
  };

  const dispose = () => {
    running = false;
    resizer.unobserve(canvas);
    layers.forEach(_ => _.dispose());
    depthBuffer.dispose();
  };

  return {
    canvas,
    gl,
    get view() {
      return view;
    },
    set view(_: View) {
      view = _;
    },
    add,
    remove,
    project,
    unproject,
    recenter,
    pick,
    dispose,
  } satisfies World;
};
