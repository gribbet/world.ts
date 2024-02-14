import { quat, vec3 } from "gl-matrix";

import { geodetic, mercator } from "./math";

const k = 1;

export type PositionTransition = {
  position: vec3;
  dispose: () => void;
};

export const createPositionTransition = () => {
  let running = true;
  let position: vec3 = [0, 0, 0];
  let current: vec3 | undefined;
  let last: number | undefined;

  const frame = (time: number) => {
    if (!running) return;
    requestAnimationFrame(frame);

    const dt = (time - (last ?? time)) / 1000;
    last = time;

    if (dt > 1) current = undefined;
    if (!current) return;

    current = vec3.add(
      current,
      current,
      vec3.scale(
        vec3.create(),
        vec3.sub(vec3.create(), position, current),
        k * dt,
      ),
    );
  };

  requestAnimationFrame(frame);

  const dispose = () => {
    running = false;
  };

  return {
    set position(_: vec3) {
      _ = mercator(_);
      if (!current) {
        position = _;
        current = _;
        return;
      }
    },
    get position() {
      return geodetic(current ?? position);
    },
    dispose,
  } satisfies PositionTransition;
};

export type PositionVelocityTransition = {
  position: vec3 | undefined;
  dispose: () => void;
};

export const createPositionVelocityTransition = () => {
  let running = true;
  let position: vec3 = [0, 0, 0];
  let current: vec3 | undefined;
  let velocity: vec3 = [0, 0, 0];
  let targetVelocity: vec3 = [0, 0, 0];
  let last: number | undefined;
  let lastTarget: number | undefined;

  const frame = (time: number) => {
    if (!running) return;
    requestAnimationFrame(frame);

    const dt = (time - (last ?? time)) / 1000;
    last = time;

    if (dt > 1) current = undefined;
    if (!current) return;

    velocity = vec3.add(
      velocity,
      velocity,
      vec3.scale(
        vec3.create(),
        vec3.sub(vec3.create(), targetVelocity, velocity),
        k * dt,
      ),
    );
    current = vec3.add(
      current,
      current,
      vec3.add(
        vec3.create(),
        vec3.scale(vec3.create(), velocity, dt),
        vec3.scale(
          vec3.create(),
          vec3.sub(vec3.create(), position, current),
          k * dt,
        ),
      ),
    );
  };
  requestAnimationFrame(frame);

  const dispose = () => {
    running = false;
  };

  return {
    set position(_: vec3) {
      _ = mercator(_);
      if (!current) {
        position = _;
        current = _;
        return;
      }
      if (lastTarget) {
        const dt = (performance.now() - lastTarget) / 1000;
        targetVelocity = vec3.scale(
          vec3.create(),
          vec3.sub(vec3.create(), _, position),
          1 / dt,
        );
      }
      position = _;
      lastTarget = performance.now();
    },
    get position() {
      return geodetic(current ?? position);
    },
    dispose,
  } satisfies PositionVelocityTransition;
};

export type OrientationTransition = {
  orientation: vec3;
  dispose: () => void;
};

export const createOrientationTransition = () => {
  let running = true;
  let orientation: vec3 = [0, 0, 0];
  let current: vec3 | undefined;
  let last: number | undefined;

  const frame = (time: number) => {
    if (!running) return;
    requestAnimationFrame(frame);

    const dt = (time - (last ?? time)) / 1000;
    last = time;

    if (dt > 1) current = undefined;
    if (!current) return;

    current = toOrientation(
      quat.slerp(
        quat.create(),
        toQuaternion(current),
        toQuaternion(orientation),
        Math.PI * k * dt,
      ),
    );
  };

  requestAnimationFrame(frame);

  const dispose = () => {
    running = false;
  };

  return {
    set orientation(_: vec3) {
      orientation = _;
      if (!current) current = _;
    },
    get orientation() {
      return current ?? orientation;
    },
    dispose,
  } satisfies OrientationTransition;
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
