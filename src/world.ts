import type { vec2, vec3 } from "gl-matrix";
import { glMatrix } from "gl-matrix";

import { createDepthBuffer } from "./depth-buffer";
import type { Layer, Properties } from "./layers";
import { geodetic, mercator } from "./math";
import type { Pick, View } from "./model";
import { createViewport } from "./viewport";

glMatrix.setMatrixArrayType(Array); // Required for precision

export type World = {
  project: (_: vec3) => vec2;
  unproject: (_: vec2) => vec3;
  pick: ([x, y]: vec2, _: { terrain?: boolean }) => Pick;
  dispose: () => void;
};

export type WorldProperties = {
  view: Partial<View>;
  layers: Layer[];
};

export const createWorld = (
  gl: WebGL2RenderingContext,
  properties: Properties<WorldProperties>,
) => {
  const { view, layers } = properties;

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

  const project = (_: vec3) => {
    const { worldToLocal, localToClip, clipToScreen } = createViewport(
      view(),
      screen,
    );
    return clipToScreen(localToClip(worldToLocal(mercator(_))));
  };

  const unproject = (_: vec2) => {
    const { localToWorld, clipToLocal, screenToClip } = createViewport(
      view(),
      screen,
    );
    return geodetic(localToWorld(clipToLocal(screenToClip(_))));
  };

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
    const position = geodetic(localToWorld(clipToLocal([x, y, z, 1])));

    const layer =
      index === 0
        ? undefined
        : terrainLayer ?? flattenLayers(layers())[index - 1];

    return { point, position, layer };
  };

  const mouseEvents = createMouseEvents(gl, pick);

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
    dispose,
  } satisfies World;
};

const flattenLayers: (_: Layer[]) => Layer[] = layers =>
  layers.flatMap<Layer>(_ => [_, ...flattenLayers(_.children ?? [])]);

const createMouseEvents = (
  gl: WebGL2RenderingContext,
  pick: ([x, y]: vec2, _?: { terrain?: boolean }) => Pick,
) => {
  const canvas = gl.canvas instanceof HTMLCanvasElement ? gl.canvas : undefined;

  let clicked = false;
  let dragging: Layer | undefined;

  const onMouseDown = () => {
    clicked = true;
  };

  const onMouseMove = ({ x, y, movementX, movementY }: MouseEvent) => {
    if (dragging) {
      const { point, position, layer } = pick([x, y], { terrain: true });
      dragging.onDrag?.({ point, position, layer });
      return;
    }

    if (clicked && (Math.abs(movementX) > 1 || Math.abs(movementY) > 1)) {
      clicked = false;
      const { point, position, layer } = pick([x, y]);
      dragging = layer;
      dragging?.onDragStart?.({ point, position, layer });
    }
  };

  const onMouseUp = (_: MouseEvent) => {
    if (clicked) onClick(_);
    if (dragging) {
      const { x, y } = _;
      const { point, position, layer } = pick([x, y]);
      dragging.onDragEnd?.({ point, position, layer });
    }
    dragging = undefined;
  };

  const onClick = ({ x, y, button }: MouseEvent) => {
    const { point, position, layer } = pick([x, y]);
    if (button === 0) layer?.onClick?.({ point, position, layer });
    else if (button === 2) layer?.onRightClick?.({ point, position, layer });
  };

  canvas?.addEventListener("mousedown", onMouseDown);
  canvas?.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);

  const dispose = () => {
    canvas?.removeEventListener("mousedown", onMouseDown);
    canvas?.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };

  return { dispose };
};
