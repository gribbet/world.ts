import { glMatrix, quat, vec2, vec3 } from "gl-matrix";
import { debounce } from "./common";
import { circumference } from "./constants";
import { createDepthBuffer } from "./depth-buffer";
import { Layer, createLineLayer, createTerrainLayer } from "./layers";
import { createMeshLayer } from "./layers/mesh";
import { Line } from "./line";
import { geodetic, mercator } from "./math";
import { Mesh } from "./mesh";
import { View, createViewport } from "./viewport";

glMatrix.setMatrixArrayType(Array); // Required for precision

export type World = {
  set view(_: View);
  get view(): View;
  set draggable(_: boolean);
  get draggable(): boolean;
  addLine: (line: Partial<Line>) => Line;
  addMesh: (mesh: Partial<Mesh>) => Mesh;
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
  }) as WebGL2RenderingContext;
  if (!gl) throw new Error("WebGL context failure");

  let layers: Layer[] = [createTerrainLayer(gl)];

  const depthBuffer = createDepthBuffer(gl);

  const resize = (screen: vec2) => {
    view.screen = screen;
    const [width, height] = screen;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    depthBuffer.resize([canvas.width * depthScale, canvas.height * depthScale]);
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
    layers.forEach((_) => _.render({ viewport }));
  };

  const depth = () => {
    let viewport = createViewport(view).scale(depthScale * devicePixelRatio);
    clear(viewport.screen);
    layers.forEach((_, index) => _.render({ viewport, depth: true, index }));
  };

  const frame = () => {
    if (!running) return;
    render();
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);

  const pick = ([screenX, screenY]: vec2) => {
    const { screenToClip, clipToLocal, localToWorld } = createViewport(view);

    depthBuffer.use();

    gl.disable(gl.BLEND);
    depth();

    const [z, n] = depthBuffer.read([
      screenX * devicePixelRatio * depthScale,
      screenY * devicePixelRatio * depthScale,
    ]);

    const [x, y] = screenToClip([screenX, screenY]);
    const p = geodetic(localToWorld(clipToLocal([x, y, z, 1])));
    return [p, n] as const;
  };

  const recenter = (center: vec2) => {
    const { camera } = createViewport(view);
    const [target] = pick(center);
    console.log(target, camera);
    const distance = vec3.distance(mercator(target), camera);
    view = {
      ...view,
      center,
      target,
      distance,
    };
  };

  const onMouseDown = ({ x, y }: MouseEvent) => {
    if (draggable) recenter([x, y]);
  };

  const onMouseMove = ({ buttons, movementX, movementY, x, y }: MouseEvent) => {
    if (buttons === 1 && draggable) {
      view = {
        ...view,
        center: [x, y],
      };
    } else if (buttons === 2) {
      const {
        screen: [width, height],
        orientation: [pitch, roll, yaw],
      } = view;
      view.orientation = [
        pitch - (movementY / height) * Math.PI,
        roll,
        yaw - (movementX / width) * Math.PI,
      ];
    }
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

  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("wheel", onWheel, { passive: true });
  canvas.addEventListener("contextmenu", onContextMenu);

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

  const destroy = () => {
    running = false;
    resizer.unobserve(canvas);
    layers.forEach((_) => _.destroy());
    layers = [];
    depthBuffer.destroy();
    canvas.removeEventListener("mousedown", onMouseDown);
    canvas.removeEventListener("mousemove", onMouseMove);
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
    addLine,
    addMesh,
    destroy,
  } satisfies World;
};
