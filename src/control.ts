import type { vec2 } from "gl-matrix";
import { vec3 } from "gl-matrix";

import { debounce } from "./common";
import { type Properties, resolve } from "./layers";
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
  let zooming = false;
  let recentered = false;

  const { view } = properties;

  const recenter = ([cx = 0, cy = 0]: vec2) => {
    const { onChangeView } = resolve(properties);

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

  const onMouseDown = () => {
    recentered = false;
  };

  const onMouseMove = ({ buttons, movementX, movementY, x, y }: MouseEvent) => {
    const {
      enabled = true,
      draggable = true,
      rotatable = true,
      onChangeView,
    } = resolve(properties);

    if (!enabled) return;

    if (draggable && !recentered) {
      recenter([x, y]);
      recentered = true;
    }

    const [width, height] = [
      canvas.width / devicePixelRatio,
      canvas.height / devicePixelRatio,
    ];

    if (buttons === 1 && draggable)
      onChangeView({
        offset: [x - width / 2, y - height / 2],
      });
    else if (buttons === 2 && rotatable) {
      const { orientation: [pitch = 0, roll = 0, yaw = 0] = [] } = view();
      const orientation = [
        Math.min(
          Math.PI / 2,
          Math.max(0, pitch - (movementY / height) * Math.PI),
        ),
        roll,
        yaw - (movementX / width) * Math.PI,
      ] satisfies vec3;
      onChangeView({
        orientation,
      });
    }
  };

  const clearZooming = debounce(() => (zooming = false), 100);

  const onWheel = ({ x, y, deltaY }: WheelEvent) => {
    const {
      enabled = true,
      draggable = true,
      onChangeView,
    } = resolve(properties);

    if (!enabled) return;

    if (!zooming) {
      if (draggable) recenter([x, y]);
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

  const onContextMenu = (event: MouseEvent) => event.preventDefault();

  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("wheel", onWheel, { passive: true });
  canvas.addEventListener("contextmenu", onContextMenu);

  const dispose = () => {
    canvas.removeEventListener("mousedown", onMouseDown);
    canvas.removeEventListener("mousemove", onMouseMove);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("contextmenu", onContextMenu);
  };

  return {
    dispose,
  } satisfies MouseControl;
};
