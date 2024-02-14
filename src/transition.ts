import { quat, vec3 } from "gl-matrix";

import { geodetic, mercator, toOrientation, toQuaternion } from "./math";

const k = 1;

export type Transition<T> = {
  value: T;
  dispose: () => void;
};

export const createTransition = <T>(
  step: (_: { time: number; current: T; target: T }) => T,
) => {
  let running = true;
  let target: T | undefined;
  let current: T | undefined;
  let last: number | undefined;

  const frame = (tick: number) => {
    if (!running) return;
    requestAnimationFrame(frame);

    const time = (tick - (last ?? tick)) / 1000;
    last = tick;

    if (time > 1) {
      current = target;
      return;
    }

    if (!current || !target) return;

    current = step({ time, current, target });
  };
  requestAnimationFrame(frame);

  const dispose = () => {
    running = false;
  };

  return {
    get value() {
      return current;
    },
    set value(_: T | undefined) {
      if (!current) current = _;
      target = _;
    },
    dispose,
  };
};

export const createNumberTransition = (
  update: (_: number, target: number) => void,
) =>
  createTransition<number>(({ time, current, target }) => {
    current = current + (target - current) * k * time;
    update(current, target);
    return current;
  });

export const createPositionTransition = (
  update?: (_: vec3, target: vec3) => void,
) =>
  createTransition<vec3>(({ time, current, target }) => {
    current = geodetic(
      vec3.add(
        vec3.create(),
        mercator(current),
        vec3.scale(
          vec3.create(),
          vec3.sub(vec3.create(), mercator(target), mercator(current)),
          k * time,
        ),
      ),
    );
    update?.(current, target);
    return current;
  });

export const createPositionVelocityTransition = (
  update?: (_: vec3, target: vec3) => void,
) => {
  let velocity: vec3 = [0, 0, 0];
  let targetVelocity: vec3 = [0, 0, 0];
  let last: vec3 | undefined;

  return createTransition<vec3>(({ time, current, target }) => {
    if (last)
      targetVelocity = vec3.scale(
        vec3.create(),
        vec3.sub(vec3.create(), mercator(current), mercator(last)),
        1 / time,
      );
    last = current;
    velocity = vec3.add(
      velocity,
      velocity,
      vec3.scale(
        vec3.create(),
        vec3.sub(vec3.create(), targetVelocity, velocity),
        k * time,
      ),
    );
    current = geodetic(
      vec3.add(
        vec3.create(),
        mercator(current),
        vec3.add(
          vec3.create(),
          vec3.scale(vec3.create(), velocity, time),
          vec3.scale(
            vec3.create(),
            vec3.sub(vec3.create(), mercator(target), mercator(current)),
            k * time,
          ),
        ),
      ),
    );
    update?.(current, target);
    return current;
  });
};

export const createOrientationTransition = (
  update?: (_: vec3, target: vec3) => void,
) =>
  createTransition<vec3>(({ time, current, target }) => {
    const value = toOrientation(
      quat.slerp(
        quat.create(),
        toQuaternion(current),
        toQuaternion(target),
        Math.PI * k * time,
      ),
    );
    update?.(value, target);
    return value;
  });
