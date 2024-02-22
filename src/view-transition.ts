import { vec3 } from "gl-matrix";

import { circumference, geodetic, mercator } from "./math";
import type { View } from "./model";
import {
  createNumberTransition,
  createOrientationTransition,
  createTransition,
  createVec2Transition,
} from "./transition";

const k = 10;

export const createViewTransition = (view: () => View) => {
  const orientation = createOrientationTransition(() => view().orientation);
  const offset = createVec2Transition(() => view().offset);
  const fieldOfView = createNumberTransition(() => view().fieldOfView);

  const transition = createTransition<View>(({ time, current, target }) => {
    const flyDistance =
      vec3.distance(mercator(current.target), mercator(target.target)) *
      circumference;

    const targetDistance = Math.max(target.distance, flyDistance);

    const q = 1 - Math.exp(-k * time);

    const distance = Math.exp(
      Math.log(current.distance) +
        (Math.log(targetDistance) - Math.log(current.distance)) * q,
    );

    const slowdown =
      current.distance > flyDistance ? 1 : current.distance / flyDistance;

    const position = geodetic(
      vec3.add(
        vec3.create(),
        mercator(current.target),
        vec3.scale(
          vec3.create(),
          vec3.sub(
            vec3.create(),
            mercator(target.target),
            mercator(current.target),
          ),
          q * slowdown,
        ),
      ),
    );

    return {
      ...current,
      target: position,
      distance,
      orientation: orientation(),
      offset: offset(),
      fieldOfView: fieldOfView(),
    };
  });

  return transition(view);
};
