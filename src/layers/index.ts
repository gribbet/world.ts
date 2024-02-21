import type { quat, vec3, vec4 } from "gl-matrix";

import type { Viewport } from "../viewport";
export * from "./billboard";
export * from "./line";
export * from "./mesh";
export * from "./polygon";
export * from "./terrain";

export type LayerOptions = {
  pickable: boolean;
  depth: boolean;
  polygonOffset: number;
};

export const defaultLayerOptions: LayerOptions = {
  pickable: true,
  depth: true,
  polygonOffset: 0,
};

export type Terrain = {
  readonly terrainUrl: string;
  imageryUrl: string;
  color: vec4;
} & LayerOptions;

export type Line = {
  points: vec3[][];
  color: vec4;
  width: number;
  minWidthPixels?: number | undefined;
  maxWidthPixels?: number | undefined;
} & LayerOptions;

export type Polygon = {
  points: vec3[][];
  color: vec4;
} & LayerOptions;

export type Mesh = {
  vertices: vec3[];
  indices: vec3[];
  position: vec3;
  orientation: quat;
  color: vec4;
  size: number;
  minSizePixels?: number;
  maxSizePixels?: number;
} & LayerOptions;

export type Billboard = {
  url: string;
  position: vec3;
  color: vec4;
  size: number;
  minSizePixels?: number;
  maxSizePixels?: number;
} & LayerOptions;

export type Layer = {
  children?: Layer[];
  render?: (_: { viewport: Viewport; depth?: boolean; index?: number }) => void;
  dispose: () => void;
};

export type Properties<T> = {
  [K in keyof T]: () => T[K];
};

export const resolve = <T>(_: Properties<T>) =>
  Object.fromEntries(
    Object.entries<() => unknown>(_).map(([key, value]) => [key, value()]),
  ) as T;

export const combine = <T extends object>(value: () => T) =>
  Object.fromEntries(
    Object.keys(value()).map(key => [key, () => value()[key as keyof T]]),
  ) as Properties<T>;

export const cache = <T, R>(_value: () => T, f: (_: T) => R) => {
  let last: [T, R] | undefined;
  return () => {
    const value = _value();
    if (last) {
      const [lastValue, lastResult] = last;
      if (lastValue === value) return lastResult;
    }
    const result = f(value);
    last = [value, result];
    return result;
  };
};
