import { debounce } from "./common";
import { circumference } from "./constants";
import { Orientation } from "./viewport";
import { World } from "./world";

const minimumDistance = 2;

export const createMouseControl = (canvas: HTMLCanvasElement, world: World) => {
  let enabled = true;
  let zooming = false;

  const onMouseDown = ({ x, y }: MouseEvent) => {
    if (enabled) world.recenter([x, y]);
  };

  const onMouseMove = ({ buttons, movementX, movementY, x, y }: MouseEvent) => {
    if (buttons === 1 && enabled)
      world.view = {
        ...world.view,
        center: [x, y],
      };
    else if (buttons === 2) {
      const {
        screen: [width = 0, height = 0],
        orientation: [pitch, roll, yaw],
      } = world.view;
      const orientation = [
        pitch - (movementY / height) * Math.PI,
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
    if (!zooming && enabled) {
      world.recenter([x, y]);
      zooming = true;
    }
    const distance = Math.min(
      Math.max(world.view.distance * Math.exp(deltaY * 0.001), minimumDistance),
      circumference
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

  const destroy = () => {
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
    destroy,
  };
};
