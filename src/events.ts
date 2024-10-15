import type { vec2 } from "gl-matrix";

import type { Layer } from "./layers";
import type { Pick, View } from "./model";
import { createViewport } from "./viewport";

export const createMouseEvents = (
  gl: WebGL2RenderingContext,
  {
    view,
    screen,
    pick,
  }: {
    view: () => Partial<View>;
    screen: () => vec2;
    pick: ([x, y]: vec2, _?: { terrain?: boolean }) => Pick;
  },
) => {
  const canvas = gl.canvas instanceof HTMLCanvasElement ? gl.canvas : undefined;

  let clicked = false;
  let dragging: Layer | undefined;
  let targetZ: number | undefined;

  const onMouseDown = () => {
    clicked = true;
  };

  const onMouseMove = (event: MouseEvent) => {
    const { x, y, movementX, movementY } = event;
    if (dragging) {
      if (dragging.onDrag) {
        const { point, position, layer } = pick([x, y], { terrain: true });
        dragging.onDrag({ point, position, layer });
      }
      if (dragging.onDragFlat) {
        const viewport = createViewport(view(), screen());
        const position = viewport.unproject([x, y], { targetZ });
        dragging.onDragFlat({ point: [x, y], position, layer: undefined });
      }

      return;
    }

    if (
      clicked &&
      event.buttons === 1 &&
      (Math.abs(movementX) > 1 || Math.abs(movementY) > 1)
    ) {
      clicked = false;
      const { point, position, layer } = pick([x, y]);
      if (layer?.onDrag || layer?.onDragFlat) {
        dragging = layer;
        dragging.onDragStart?.({ point, position, layer });
        [, , targetZ] = position;
      }
      return;
    }

    const { point, position, layer } = pick([x, y]);
    layer?.onMouseMove?.({ point, position, layer });
  };

  const onMouseUp = (_: MouseEvent) => {
    if (clicked) onClick(_);
    clicked = false;
    if (dragging) {
      const { x, y } = _;
      const { point, position, layer } = pick([x, y]);
      dragging.onDragEnd?.({ point, position, layer });
    }
    dragging = undefined;
  };

  const onClick = (event: MouseEvent) => {
    const { x, y, button } = event;
    const { point, position, layer } = pick([x, y]);
    (button === 2 ? layer?.onRightClick : layer?.onClick)?.(
      { point, position, layer },
      event,
    );
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

  return {
    get dragging() {
      return !!dragging;
    },
    dispose,
  };
};
