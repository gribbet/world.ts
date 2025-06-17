import type { vec2, vec3 } from "gl-matrix";
import { glMatrix } from "gl-matrix";

import type { Context } from "./context";
import { createDepthBuffer } from "./depth-buffer";
import { createMouseEvents } from "./events";
import type { Layer, Properties, TerrainLayer } from "./layers";
import { geodetic } from "./math";
import type { Pick, View } from "./model";
import { createViewport } from "./viewport";

glMatrix.setMatrixArrayType(Array); // Required for precision

export type World = {
  project: (_: vec3) => vec2;
  unproject: (_: vec2) => vec3;
  pick: ([x, y]: vec2, _?: { terrain?: boolean }) => Pick;
  elevation: (_: vec2) => number;
  dragging: boolean;
  dispose: () => void;
};

export type WorldProperties = {
  view: Partial<View>;
  layers: readonly [TerrainLayer, ...Layer[]];
};

export const createWorld = (
  { gl }: Context,
  properties: Properties<WorldProperties>,
) => {
  const { view, layers } = properties;

  let running = true;
  let screen: vec2 = [0, 0];

  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.FRONT);
  gl.depthFunc(gl.LEQUAL);

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
    const viewport = createViewport(view(), screen);
    clear(screen);

    flattenLayers(layers()).forEach(_ => _.render?.({ viewport }));
  };

  const depth = (layer?: Layer) => {
    const viewport = createViewport(view(), screen);
    clear(screen);
    (layer ? [layer] : flattenLayers(layers())).forEach((_, i) =>
      _.render?.({ viewport, depth: true, index: i + 1 }),
    );
  };

  const frame = () => {
    if (!running) return;
    render();
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);

  const project = (_: vec3) => createViewport(view(), screen).project(_);

  const unproject = (_: vec2) => createViewport(view(), screen).unproject(_);

  const pick = (point: vec2, { terrain }: { terrain?: boolean } = {}) => {
    const { screenToClip, clipToLocal, localToWorld } = createViewport(
      view(),
      screen,
    );

    depthBuffer.use();

    const [terrainLayer] = terrain ? layers() : [];
    depth(terrainLayer);

    const [px = 0, py = 0] = point;

    const [z, index] = depthBuffer.read([
      px * devicePixelRatio,
      py * devicePixelRatio,
    ]);

    const [x = 0, y = 0] = screenToClip(point);
    let position = geodetic(localToWorld(clipToLocal([x, y, z, 1])));

    const layer =
      index === 0
        ? undefined
        : terrainLayer ?? flattenLayers(layers())[index - 1];

    if (terrain) {
      const [lng = 0, lat = 0] = position;
      const alt = terrainLayer?.elevation([lng, lat]) ?? 0;
      position = [lng, lat, alt];
    }

    return { point, position, layer };
  };

  const mouseEvents = createMouseEvents(gl, {
    view,
    screen: () => screen,
    pick,
  });

  const elevation = (_: vec2) => {
    const [terrainLayer] = layers();
    return terrainLayer.elevation(_);
  };

  const dispose = () => {
    running = false;
    mouseEvents.dispose();
    depthBuffer.dispose();
    if (canvas instanceof HTMLCanvasElement) resizer.unobserve(canvas);
  };

  return {
    project,
    unproject,
    pick,
    elevation,
    get dragging() {
      return mouseEvents.dragging;
    },
    dispose,
  } satisfies World;
};

const flattenLayers: (_: readonly Layer[], results?: Layer[]) => Layer[] = (
  layers,
  results = [],
) =>
  layers.reduce((results, _) => {
    flattenLayers(_.children ?? [], results);
    results.push(_);
    return results;
  }, results);
