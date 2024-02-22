import type { quat, vec3, vec4 } from "gl-matrix";

import type { Viewport } from "../viewport";
export * from "./billboard";
export * from "./line";
export * from "./mesh";
export * from "./polygon";
export * from "./terrain";
import type { Pick } from "../model";

export type LayerEvents = {
  onClick?: (_: Pick) => void;
  onRightClick?: (_: Pick) => void;
  onDragStart?: (_: Pick) => void;
  onDrag?: (_: Pick) => void;
  onDragEnd?: (_: Pick) => void;
};

export type LayerOptions = {
  pickable: boolean;
  depth: boolean;
  polygonOffset: number;
} & LayerEvents;

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
  depthWidthPixels?: number | undefined;
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
} & LayerEvents;

export type Properties<T> = {
  // eslint-disable-next-line @typescript-eslint/ban-types
  [K in keyof T]: T[K] extends Function | undefined ? T[K] : () => T[K];
};

export const resolve = <T>(_: Properties<T>) =>
  Object.fromEntries(
    Object.entries(_)
      .filter(([key]) => !key.startsWith("on"))
      .map(([key, value]) => [
        key,
        typeof value === "function" ? value() : value,
      ]),
  ) as T;

export const combine = <T extends object>(properties: () => T) =>
  Object.fromEntries(
    Object.keys(properties()).map(key => {
      const value = () => properties()[key as keyof T];
      return [key, typeof value() === "function" ? value() : () => value()];
    }),
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

export const createMouseEvents = (
  properties: Properties<Partial<LayerOptions>>,
) => {
  const { onClick, onRightClick, onDrag, onDragStart, onDragEnd } = properties;
  return { onClick, onRightClick, onDrag, onDragStart, onDragEnd };
};
