import { quat, vec2, vec3, vec4 } from "gl-matrix";

import {
  circumference,
  geodetic,
  mercator,
  toOrientation,
  toQuaternion,
} from "./math";

const k = 10;
const epsilon = 1e-3;

export type Transition<T> = {
  value: T;
  dispose: () => void;
};

export const createTransition =
  <T>(step: (_: { time: number; current: T; target: T }) => T) =>
  (_target: () => T) => {
    let current: T | undefined;
    let last: number | undefined;

    return () => {
      const now = performance.now();
      const time = (now - (last ?? now)) / 1000;
      last = now;

      if (time > 1) current = undefined;

      const target = _target();
      current = current ?? target;
      current = step({ time, current, target });
      return current;
    };
  };

export const createNumberTransition = createTransition<number>(
  ({ time, current, target }) => {
    if (Math.abs(target - current) < epsilon) current = target;
    else current = current + (target - current) * (1 - Math.exp(-k * time));
    return current;
  },
);

export const createVec2Transition = createTransition<vec2>(
  ({ time, current, target }) => {
    if (vec2.distance(current, target) < epsilon) vec2.copy(current, target);
    else
      current = vec2.add(
        vec2.create(),
        current,
        vec2.scale(
          vec2.create(),
          vec2.sub(vec2.create(), target, current),
          1 - Math.exp(-k * time),
        ),
      );
    return current;
  },
);

export const createVec4Transition = createTransition<vec4>(
  ({ time, current, target }) => {
    if (vec4.distance(current, target) < epsilon) vec4.copy(current, target);
    else
      current = vec4.add(
        vec4.create(),
        current,
        vec4.scale(
          vec4.create(),
          vec4.sub(vec4.create(), target, current),
          1 - Math.exp(-k * time),
        ),
      );

    return current;
  },
);

export const createPositionTransition = createTransition<vec3>(
  ({ time, current, target }) => {
    const distance = vec3.distance(mercator(current), mercator(target));
    if (distance * circumference < epsilon || distance > 100000 / circumference)
      vec3.copy(current, target);
    else
      current = geodetic(
        vec3.add(
          vec3.create(),
          mercator(current),
          vec3.scale(
            vec3.create(),
            vec3.sub(vec3.create(), mercator(target), mercator(current)),
            1 - Math.exp(-k * time),
          ),
        ),
      );
    return current;
  },
);

export const createPositionVelocityTransition = (target: () => vec3) => {
  let velocity: vec3 = [0, 0, 0];
  let targetVelocity: vec3 = [0, 0, 0];
  let last: vec3 | undefined;
  let lastTime: number | undefined;

  const transition = createTransition<vec3>(({ time, current, target }) => {
    if (
      target === current ||
      time > 1 ||
      vec3.distance(mercator(target), mercator(current)) > 1000 / circumference
    ) {
      last = undefined;
      velocity = [0, 0, 0];
      targetVelocity = [0, 0, 0];
      return target;
    }

    if (!last) {
      last = target;
      lastTime = time;
    } else if (
      target !== last &&
      lastTime !== undefined &&
      time - lastTime > 1
    ) {
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

  return transition(target);
};

export const createOrientationTransition = createTransition<vec3>(
  ({ time, current, target }) => {
    current = toOrientation(
      quat.slerp(
        quat.create(),
        toQuaternion(current),
        toQuaternion(target),
        Math.PI * time,
      ),
    );
    if (quat.getAngle(toQuaternion(current), toQuaternion(target)) < epsilon)
      target = current;
    return current;
  },
);
