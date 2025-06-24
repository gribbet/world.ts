import { quat, vec2, vec3, vec4 } from "gl-matrix";

import {
  circumference,
  geodetic,
  mercator,
  toOrientation,
  toQuaternion,
} from "./math";

const k = 8;
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

export const createVec2Transition = (target: () => vec2) =>
  createTransition<vec2>(({ time, current, target }) => {
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
  })(() => vec2.clone(target()));

export const createVec4Transition = (target: () => vec4) =>
  createTransition<vec4>(({ time, current, target }) => {
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
  })(() => vec4.clone(target()));

export const createPositionTransition = (target: () => vec3) =>
  createTransition<vec3>(({ time, current, target }) => {
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
  })(() => vec3.clone(target()));

export const createPositionVelocityTransition = (target: () => vec3) => {
  const tau = 0.5;

  let initialized = false;
  let lastTarget = vec3.create();
  const position = vec3.create();
  const velocity = vec3.create();
  const targetPosition = vec3.create();
  const targetVelocity = vec3.create();
  const error = vec3.create();
  const estimate = vec3.create();
  let lastTime = 0;
  let targetTime = 0;

  return () => {
    const now = performance.now() / 1000;
    if (now === lastTime) return geodetic(position);
    const next = target();

    if (
      !initialized ||
      now - lastTime > 1 ||
      vec3.distance(mercator(position), mercator(targetPosition)) >
        1000 / circumference
    ) {
      initialized = true;
      lastTarget = next;
      lastTime = now;
      targetTime = now;
      vec3.copy(position, mercator(lastTarget));
      vec3.set(velocity, 0, 0, 0);
      vec3.copy(targetPosition, position);
      vec3.set(targetVelocity, 0, 0, 0);
      return geodetic(position);
    }

    if (lastTarget !== next) {
      lastTarget = next;
      const target = mercator(next);
      vec3.scale(
        targetVelocity,
        vec3.subtract(targetVelocity, target, targetPosition),
        1 / (now - targetTime),
      );
      vec3.copy(targetPosition, target);
      targetTime = now;
    }

    const dt = now - lastTime;

    const alpha = 1 - Math.exp(-dt / tau);
    const beta = (alpha * (2 - alpha)) / 1000;

    vec3.scaleAndAdd(position, position, velocity, dt);
    vec3.scaleAndAdd(estimate, targetPosition, targetVelocity, dt);
    vec3.subtract(error, estimate, position);
    vec3.scaleAndAdd(position, position, error, alpha);
    vec3.scaleAndAdd(velocity, velocity, error, beta / dt);

    lastTime = now;

    return geodetic(position);
  };
};

export const createOrientationTransition = (target: () => vec3) => {
  const transition = createQuaternionTransition(() => toQuaternion(target()));
  return () => toOrientation(transition());
};

export const createQuaternionTransition = (target: () => quat) =>
  createTransition<quat>(({ time, current, target }) => {
    let angle = quat.getAngle(current, target);
    if (isNaN(angle)) angle = 0;
    current = quat.slerp(
      quat.create(),
      current,
      target,
      k * Math.max(0.5, angle) * time,
    );
    if (angle < epsilon) current = target;
    return current;
  })(() => quat.clone(target()));
