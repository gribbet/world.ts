import { quat, vec2, vec3 } from "gl-matrix";

import { circumference } from "./constants";
import { mercator } from "./math";
import type { View } from "./model";
import type { World } from "./world";

export type ViewTransition = {
  view: Partial<View>;
  dispose: () => void;
};

export const createViewTransition = (world: World) => {
  let running = true;
  let goal: Partial<View> = {};
  let last: number | undefined;

  const frame = (time: number) => {
    if (!running) return;
    requestAnimationFrame(frame);

    const dt = (time - (last ?? time)) / 1000;
    last = time;

    const epsilon = 1e-3;
    const q = 10 * dt;

    const view = { ...world.view };

    if (goal.target) {
      if (!goal.distance) goal.distance = view.distance;
      const delta = vec3.sub(vec3.create(), goal.target, view.target);
      const finished = vec3.length(delta) < epsilon;
      const target = finished
        ? goal.target
        : vec3.scaleAndAdd(vec3.create(), view.target, delta, q);
      view.target = target;
      if (finished) goal.target = undefined;
    }

    if (goal.offset) {
      const delta = vec2.sub(vec2.create(), goal.offset, view.offset);
      const finished = vec2.length(delta) < epsilon;
      const offset = finished
        ? goal.offset
        : vec2.scaleAndAdd(vec2.create(), view.offset, delta, q);
      view.offset = offset;
      if (finished) goal.offset = undefined;
    }

    const targetDistance =
      goal.target !== undefined
        ? vec3.distance(mercator(goal.target), mercator(view.target)) *
          circumference
        : undefined;

    const goalDistance = Math.max(
      ...[targetDistance, goal.distance ?? view.distance, 0].filter(
        (_): _ is number => _ !== undefined,
      ),
    );

    if (goalDistance) {
      const delta = goalDistance - view.distance;
      const finished = Math.abs(delta) < epsilon;
      const distance = finished ? goalDistance : view.distance + delta * q;
      view.distance = distance;
      if (finished) goal.distance = undefined;
    }

    if (goal.orientation) {
      const goalOrientation = toQuaternion(goal.orientation);
      const viewOrientation = toQuaternion(view.orientation);
      const finished =
        quat.getAngle(goalOrientation, viewOrientation) < epsilon;
      const orientation = toOrientation(
        finished
          ? goalOrientation
          : quat.slerp(quat.create(), viewOrientation, goalOrientation, q),
      );
      view.orientation = orientation;
      if (finished) goal.orientation = undefined;
    }

    if (goal.fieldOfView !== undefined) {
      const delta = goal.fieldOfView - view.fieldOfView;
      const finished = Math.abs(delta) < epsilon;
      const fieldOfView = finished
        ? goal.fieldOfView
        : view.fieldOfView + delta * q;
      view.fieldOfView = fieldOfView;
      if (finished) goal.fieldOfView = fieldOfView;
    }

    world.view = view;
  };

  requestAnimationFrame(frame);

  const dispose = () => {
    running = false;
  };

  return {
    set view(_: Partial<View>) {
      goal = _;
    },
    get view() {
      return goal;
    },
    dispose,
  } satisfies ViewTransition;
};

const toQuaternion = ([pitch = 0, yaw = 0, roll = 0]: vec3) => {
  const cy = Math.cos(yaw * 0.5);
  const sy = Math.sin(yaw * 0.5);
  const cp = Math.cos(pitch * 0.5);
  const sp = Math.sin(pitch * 0.5);
  const cr = Math.cos(roll * 0.5);
  const sr = Math.sin(roll * 0.5);

  const w = cr * cp * cy + sr * sp * sy;
  const x = sr * cp * cy - cr * sp * sy;
  const y = cr * sp * cy + sr * cp * sy;
  const z = cr * cp * sy - sr * sp * cy;

  return [x, y, z, w] satisfies quat;
};

const toOrientation = ([x = 0, y = 0, z = 0, w = 0]: quat) => {
  const roll = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
  const pitch = Math.asin(2 * (w * y - z * x));
  const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  return [pitch, yaw, roll] satisfies vec3;
};
