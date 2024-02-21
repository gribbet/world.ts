import { quat, vec3, vec4 } from "gl-matrix";

import { geodetic, mercator, toOrientation, toQuaternion } from "./math";

const k = 10;
const epsilon = 1e-3;

export type Transition<T> = {
  value: T;
  dispose: () => void;
};

export const createTransition = <T>(
  step: (_: { time: number; current: T; target: T }) => T,
) => {
  let target: T | undefined;
  let current: T | undefined;
  let last: number | undefined;

  return {
    get value() {
      const now = performance.now();
      const time = (now - (last ?? now)) / 1000;
      last = now;

      if (time > 1) {
        current = target;
        target = undefined;
      }

      if (!current || !target) return;

      current = step({ time, current, target });
      return current;
    },
    set value(_: T | undefined) {
      if (!current || !_) current = _;
      target = _;
    },
  };
};

export const createNumberTransition = (
  update?: (_: number, target: number) => void,
) =>
  createTransition<number>(({ time, current, target }) => {
    current = current + (target - current) * k * time;
    if (Math.abs(target - current) < epsilon) current = target;
    update?.(current, target);
    return current;
  });

export const createColorTransition = (
  update?: (_: vec4, target: vec4) => void,
) =>
  createTransition<vec4>(({ time, current, target }) => {
    current = vec4.add(
      vec4.create(),
      current,
      vec4.scale(
        vec4.create(),
        vec4.sub(vec4.create(), target, current),
        k * time,
      ),
    );
    if (vec4.distance(current, target) < epsilon) current = target;
    update?.(current, target);
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
    if (vec3.distance(current, target) < epsilon) current = target;
    update?.(current, target);
    return current;
  });

export const createPositionVelocityTransition = () => {
  let velocity: vec3 = [0, 0, 0];
  let targetVelocity: vec3 = [0, 0, 0];
  let last: vec3 | undefined;
  let lastTime: number | undefined;

  return createTransition<vec3>(({ time, current, target }) => {
    if (target === current || time > 1) {
      last = undefined;
      velocity = [0, 0, 0];
      targetVelocity = [0, 0, 0];
      return current;
    }

    if (!last) {
      last = target;
      lastTime = time;
    } else if (target !== last && lastTime !== undefined) {
      targetVelocity = vec3.scale(
        vec3.create(),
        vec3.sub(vec3.create(), mercator(target), mercator(last)),
        1000 / (performance.now() - lastTime),
      );
      last = target;
      lastTime = performance.now();
    }

    const nextVelocity = vec3.add(
      vec3.create(),
      velocity,
      vec3.scale(
        vec3.create(),
        vec3.sub(vec3.create(), targetVelocity, velocity),
        2 * time,
      ),
    );

    current = geodetic(
      vec3.add(
        vec3.create(),
        mercator(current),
        vec3.add(
          vec3.create(),
          vec3.scale(
            vec3.create(),
            vec3.add(vec3.create(), velocity, nextVelocity),
            0.5 * time,
          ),
          vec3.scale(
            vec3.create(),
            vec3.sub(vec3.create(), mercator(target), mercator(current)),
            time,
          ),
        ),
      ),
    );

    velocity = nextVelocity;

    return current;
  });
};

export const createOrientationTransition = (
  update?: (_: vec3, target: vec3) => void,
) =>
  createTransition<vec3>(({ time, current, target }) => {
    current = toOrientation(
      quat.slerp(
        quat.create(),
        toQuaternion(current),
        toQuaternion(target),
        2 * time,
      ),
    );
    if (quat.getAngle(toQuaternion(current), toQuaternion(target)) < epsilon)
      target = current;
    update?.(current, target);
    return current;
  });
