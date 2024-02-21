import { quat, vec2, vec3 } from "gl-matrix";

import { circumference, mercator, toOrientation, toQuaternion } from "./math";
import type { View } from "./model";
import type { World } from "./world";

const k = 10;

export type ViewTransition = {
  view: Partial<View>;
  dispose: () => void;
};

export const createViewTransition = (world: World) => {
  let running = true;
  let target: Partial<View> = {};
  let last: number | undefined;

  const frame = () => {
    if (!running) return;
    requestAnimationFrame(frame);

    const now = performance.now();
    const time = (now - (last ?? now)) / 1000;
    last = now;

    const epsilon = 1e-3;

    const view = { ...world.view };

    const flyDistance =
      target.target !== undefined
        ? vec3.distance(mercator(target.target), mercator(view.target)) *
          circumference
        : 0;

    if (target.target) {
      if (!target.distance) target.distance = view.distance;
      const delta = vec3.sub(vec3.create(), target.target, view.target);
      const finished = vec3.length(delta) * circumference < epsilon;
      const slowdown =
        view.distance > flyDistance ? 1 : view.distance / flyDistance;
      view.target = finished
        ? target.target
        : vec3.scaleAndAdd(
            vec3.create(),
            view.target,
            delta,
            k * time * slowdown,
          );
      if (finished) target.target = undefined;
    }

    if (target.offset) {
      const delta = vec2.sub(vec2.create(), target.offset, view.offset);
      const finished = vec2.length(delta) < epsilon;
      view.offset = finished
        ? target.offset
        : vec2.scaleAndAdd(vec2.create(), view.offset, delta, k * time);
      if (finished) target.offset = undefined;
    }

    const goalDistance = Math.max(
      ...[flyDistance, target.distance ?? view.distance],
    );

    if (goalDistance) {
      const delta = goalDistance - view.distance;
      const finished = Math.abs(delta) / 10000 < epsilon;
      view.distance = finished
        ? goalDistance
        : view.distance + delta * k * time;
      if (finished) target.distance = undefined;
    }

    if (target.orientation) {
      const goalOrientation = toQuaternion(target.orientation);
      const viewOrientation = toQuaternion(view.orientation);
      const finished =
        quat.getAngle(goalOrientation, viewOrientation) < epsilon;
      const orientation = toOrientation(
        finished
          ? goalOrientation
          : quat.slerp(
              quat.create(),
              viewOrientation,
              goalOrientation,
              k * time,
            ),
      );
      view.orientation = orientation;
      if (finished) target.orientation = undefined;
    }

    if (target.fieldOfView !== undefined) {
      const delta = target.fieldOfView - view.fieldOfView;
      const finished = Math.abs(delta) < epsilon;
      const fieldOfView = finished
        ? target.fieldOfView
        : view.fieldOfView + delta * k * time;
      view.fieldOfView = fieldOfView;
      if (finished) target.fieldOfView = fieldOfView;
    }

    world.view = view;
  };

  requestAnimationFrame(frame);

  const dispose = () => {
    running = false;
  };

  return {
    set view(_: Partial<View>) {
      target = _;
    },
    get view() {
      return target;
    },
    dispose,
  } satisfies ViewTransition;
};
