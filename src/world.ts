import type { vec2, vec3 } from "gl-matrix";
import { glMatrix } from "gl-matrix";

import { createDepthBuffer } from "./depth-buffer";
import type { Layer } from "./layers";
import { geodetic, mercator } from "./math";
import type { View } from "./model";
import { createViewport } from "./viewport";

glMatrix.setMatrixArrayType(Array); // Required for precision

type Pick = {
  point: vec2;
  position: vec3;
  layer: Layer | undefined;
};

export type World = {
  project: (_: vec3) => vec2;
  unproject: (_: vec2) => vec3;
  pick: ([x, y]: vec2, layer?: Layer) => Pick;
  dispose: () => void;
};

export type WorldProperties = {
  view: Partial<View>;
  layers: Layer[];
};

export const createWorld = (
  gl: WebGL2RenderingContext,
  properties: () => WorldProperties,
) => {
  let running = true;
  let screen: vec2 = [0, 0];

  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.FRONT);

  const depthBuffer = createDepthBuffer(gl);

  const { canvas } = gl;

  const resize = ([width = 0, height = 0]: vec2) => {
    width = width || 1;
    height = height || 1;
    screen = [width, height];
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    depthBuffer.resize([canvas.width, canvas.height]);
  };

  resize([canvas.width, canvas.height]);

  const resizer = new ResizeObserver(([entry]) => {
    if (!entry) return;
    const { contentRect } = entry;
    const { width, height } = contentRect;
    resize([width, height]);
  });
  if (canvas instanceof HTMLCanvasElement) resizer.observe(canvas);

  const clear = ([width = 0, height = 0]: vec2) => {
    gl.viewport(0, 0, width * devicePixelRatio, height * devicePixelRatio);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  };

  const render = () => {
    const { view, layers } = properties();
    const viewport = createViewport(view, screen);
    clear(screen);

    flattenLayers(layers).forEach(_ => _.render?.({ viewport }));
  };

  const depth = (layer?: Layer) => {
    const { view, layers } = properties();
    const viewport = createViewport(view, screen);
    clear(screen);
    (layer ? [layer] : flattenLayers(layers)).forEach((_, i) =>
      _.render?.({ viewport, depth: true, index: i + 1 }),
    );
  };

  const frame = () => {
    if (!running) return;
    render();
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);

  const project = (_: vec3) => {
    const { view } = properties();
    const { worldToLocal, localToClip, clipToScreen } = createViewport(
      view,
      screen,
    );
    return clipToScreen(localToClip(worldToLocal(mercator(_))));
  };

  const unproject = (_: vec2) => {
    const { view } = properties();
    const { localToWorld, clipToLocal, screenToClip } = createViewport(
      view,
      screen,
    );
    return geodetic(localToWorld(clipToLocal(screenToClip(_))));
  };

  const pick = (point: vec2, pickLayer?: Layer) => {
    const { view, layers } = properties();
    const { screenToClip, clipToLocal, localToWorld } = createViewport(
      view,
      screen,
    );

    depthBuffer.use();

    depth(pickLayer);

    const [px = 0, py = 0] = point;

    const [z, index] = depthBuffer.read([
      px * devicePixelRatio,
      py * devicePixelRatio,
    ]);

    const [x = 0, y = 0] = screenToClip(point);
    const position = geodetic(localToWorld(clipToLocal([x, y, z, 1])));

    const layer =
      index === 0 ? undefined : pickLayer ?? flattenLayers(layers)[index - 1];

    return { point, position, layer };
  };

  const dispose = () => {
    running = false;
    if (canvas instanceof HTMLCanvasElement) resizer.unobserve(canvas);
    depthBuffer.dispose();
  };

  return {
    project,
    unproject,
    pick,
    dispose,
  } satisfies World;
};

const flattenLayers: (_: Layer[]) => Layer[] = layers =>
  layers.flatMap<Layer>(_ => [_, ...flattenLayers(_.children ?? [])]);
