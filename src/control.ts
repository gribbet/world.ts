import { debounce } from "./common";
import { circumference } from "./constants";
import type { Orientation } from "./model";
import type { World } from "./world";

const minimumDistance = 2;

export const createMouseControl = (canvas: HTMLCanvasElement, world: World) => {
  let enabled = true;
  let draggable = true;
  let rotatable = true;
  let zooming = false;
  let recentered = false;

  const onMouseDown = () => {
    recentered = false;
    if (!enabled || !draggable) return;
  };

  const onMouseMove = ({ buttons, movementX, movementY, x, y }: MouseEvent) => {
    if (!enabled) return;
    if (draggable && !recentered) {
      world.recenter([x, y]);
      recentered = true;
    }
    if (buttons === 1 && draggable) {
      const [width = 0, height = 0] = world.view.screen;
      world.view = {
        ...world.view,
        offset: [x - width / 2, y - height / 2],
      };
    } else if (buttons === 2 && rotatable) {
      const {
        screen: [width = 0, height = 0],
        orientation: [pitch, roll, yaw],
      } = world.view;
      const orientation = [
        Math.min(
          Math.PI / 2,
          Math.max(0, pitch - (movementY / height) * Math.PI),
        ),
        roll,
        yaw - (movementX / width) * Math.PI,
      ] satisfies Orientation;
      world.view = {
        ...world.view,
        orientation,
      };
    }
  };

  const clearZooming = debounce(() => (zooming = false), 100);

  const onWheel = ({ x, y, deltaY }: WheelEvent) => {
    if (!enabled) return;
    if (!zooming) {
      if (draggable) world.recenter([x, y]);
      zooming = true;
    }
    const distance = Math.min(
      Math.max(world.view.distance * Math.exp(deltaY * 0.001), minimumDistance),
      circumference,
    );
    world.view = {
      ...world.view,
      distance,
    };
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
    get enabled() {
      return enabled;
    },
    set enabled(_: boolean) {
      enabled = _;
    },
    get draggable() {
      return draggable;
    },
    set draggable(_: boolean) {
      draggable = _;
    },
    get rotatable() {
      return rotatable;
    },
    set rotatable(_: boolean) {
      rotatable = _;
    },
    dispose,
  };
};
