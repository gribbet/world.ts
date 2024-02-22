import type { vec2 } from "gl-matrix";

import type { Layer } from "./layers";
import type { Pick } from "./model";

export const createMouseEvents = (
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

  const onDoubleClick = ({ x, y }: MouseEvent) => {
    const { point, position, layer } = pick([x, y]);
    layer?.onDoubleClick?.({ point, position, layer });
  };

  canvas?.addEventListener("mousedown", onMouseDown);
  canvas?.addEventListener("mousemove", onMouseMove);
  canvas?.addEventListener("dblclick", onDoubleClick);
  window.addEventListener("mouseup", onMouseUp);

  const dispose = () => {
    canvas?.removeEventListener("mousedown", onMouseDown);
    canvas?.removeEventListener("mousemove", onMouseMove);
    canvas?.removeEventListener("dblclick", onDoubleClick);
    window.removeEventListener("mouseup", onMouseUp);
  };

  return { dispose };
};
