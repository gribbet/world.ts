import type { vec2 } from "gl-matrix";
import { vec3 } from "gl-matrix";

import { debounce } from "./common";
import { type Properties } from "./layers";
import { circumference, mercator } from "./math";
import { defaultView, type View } from "./model";
import { createViewport } from "./viewport";
import type { World } from "./world";

const minimumDistance = 100;

export type MouseControl = {
  dispose: () => void;
};

export type MouseControlProperties = {
  enabled?: boolean;
  draggable?: boolean;
  rotatable?: boolean;
  view: Partial<View>;
  onChangeView: (_: Partial<View>) => void;
};

export const createMouseControl = (
  canvas: HTMLCanvasElement,
  world: World,
  properties: Properties<MouseControlProperties>,
) => {
  const {
    enabled = () => true,
    draggable = () => true,
    rotatable = () => true,
    onChangeView,
  } = properties;

  let zooming = false;
  let recentered = false;

  const { view } = properties;

  const recenter = ([cx = 0, cy = 0]: vec2) => {
    const [width, height] = [
      canvas.width / devicePixelRatio,
      canvas.height / devicePixelRatio,
    ];

    const { camera, fieldScale } = createViewport(view(), [width, height]);
    const { position: target, layer } = world.pick([cx, cy]);
    if (!layer) return;
    const distance =
      (vec3.distance(mercator(target), camera) * circumference) / fieldScale;
    const offset: vec2 = [cx - width / 2, cy - height / 2];

    onChangeView({
      offset,
      target,
      distance,
    });
  };

  const onDrag = (x: number, y: number) => {
    if (!draggable() || world.dragging) return;

    if (!recentered) {
      recenter([x, y]);
      recentered = true;
    }

    const [width, height] = [
      canvas.width / devicePixelRatio,
      canvas.height / devicePixelRatio,
    ];

    onChangeView({
      offset: [x - width / 2, y - height / 2],
    });
  };

  const onRotate = (
    x: number,
    y: number,
    movementX: number,
    movementY: number,
  ) => {
    if (!rotatable()) return;

    if (draggable() && !recentered) {
      recenter([x, y]);
      recentered = true;
    }

    const [width, height] = [
      canvas.width / devicePixelRatio,
      canvas.height / devicePixelRatio,
    ];

    const [pitch = 0, roll = 0, yaw = 0] = view().orientation ?? [];
    const orientation = [
      Math.min(
        Math.PI / 2 - 0.1,
        Math.max(0.1, pitch - (movementY / height) * Math.PI),
      ),
      roll,
      yaw - (movementX / width) * Math.PI,
    ] satisfies vec3;

    onChangeView({
      orientation,
    });
  };

  const onMouseDown = (event: Event) => {
    event.preventDefault();
    recentered = false;
  };

  const onMouseMove = ({ buttons, movementX, movementY, x, y }: MouseEvent) => {
    if (!enabled() || !buttons) return;
    if (buttons === 1 && draggable()) onDrag(x, y);
    else if (buttons === 2 && rotatable()) onRotate(x, y, movementX, movementY);
  };

  const onTouchMove = (event: TouchEvent) => {
    event.preventDefault();
    const touch = event.touches.item(0);
    if (!touch) return;
    const { clientX: x, clientY: y } = touch;
    onDrag(x, y);
  };

  const clearZooming = debounce(() => (zooming = false), 100);

  const onWheel = ({ x, y, deltaY }: WheelEvent) => {
    if (!enabled()) return;

    if (!zooming) {
      if (draggable()) recenter([x, y]);
      zooming = true;
    }

    let { distance } = { ...defaultView, ...view() };

    distance = Math.min(
      Math.max(distance * Math.exp(deltaY * 0.001), minimumDistance),
      circumference,
    );
    onChangeView({ distance });
    clearZooming();
  };

  const onGestureStart = (event: Event) => event.preventDefault();

  const onContextMenu = (event: MouseEvent) => event.preventDefault();

  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("touchstart", onMouseDown, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("gesturestart", onGestureStart);
  canvas.addEventListener("wheel", onWheel, { passive: true });
  canvas.addEventListener("contextmenu", onContextMenu);

  const dispose = () => {
    canvas.removeEventListener("mousedown", onMouseDown);
    canvas.removeEventListener("mousemove", onMouseMove);
    canvas.removeEventListener("touchstart", onMouseDown);
    canvas.removeEventListener("touchmove", onTouchMove);
    canvas.removeEventListener("gesturestart", onGestureStart);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("contextmenu", onContextMenu);
  };

  return {
    dispose,
  } satisfies MouseControl;
};
