import type { quat, vec3, vec4 } from "gl-matrix";

import type { Viewport } from "../viewport";
export * from "./billboard";
export * from "./container";
export * from "./line";
export * from "./object";
export * from "./polygon";
export * from "./radar";
export * from "./terrain";
import type { Pick } from "../model";

export type LayerEvents = {
  onClick?: (_: Pick, event: MouseEvent) => void;
  onRightClick?: (_: Pick, event: MouseEvent) => void;
  onDoubleClick?: (_: Pick) => void;
  onDragStart?: (_: Pick) => void;
  onDrag?: (_: Pick) => void;
  onDragFlat?: (_: Pick) => void;
  onDragEnd?: (_: Pick) => void;
  onMouseMove?: (_: Pick) => void;
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
  downsample?: number;
} & LayerOptions;

export type Line = {
  points: vec3[][];
  color: vec4;
  width: number;
  minWidthPixels?: number | undefined;
  maxWidthPixels?: number | undefined;
  depthWidthPixels?: number | undefined;
  dashPattern: vec4[];
  dashSize: number;
  dashOffset: number;
} & LayerOptions;

export type Polygon = {
  points: vec3[][][];
  color: vec4;
} & LayerOptions;

export type Mesh = {
  vertices: vec3[];
  indices: vec3[];
  normals: vec3[];
};

export type Object = {
  mesh: Mesh;
  position: vec3;
  orientation: quat;
  color: vec4;
  diffuse: vec4;
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

export type Radar = {
  image: ImageData;
  range: number;
  position: vec3;
  orientation: quat;
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

export const cacheAll = <T extends readonly unknown[], R>(
  _value: { [K in keyof T]: () => T[K] },
  f: (args: T) => R,
) => {
  let last: [T, R] | undefined;
  return () => {
    const value = _value.map(_ => _()) as unknown as T;
    if (last) {
      const [lastValue, lastResult] = last;
      let match = true;
      for (let i = 0; i < value.length; i++)
        if (lastValue[i] !== value[i]) {
          match = false;
          break;
        }
      if (match) return lastResult;
    }
    const result = f(value);
    last = [value, result];
    return result;
  };
};

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
  const {
    onClick,
    onRightClick,
    onDoubleClick,
    onDrag,
    onDragFlat,
    onDragStart,
    onDragEnd,
    onMouseMove,
  } = properties;
  return {
    onClick,
    onRightClick,
    onDoubleClick,
    onDrag,
    onDragFlat,
    onDragStart,
    onDragEnd,
    onMouseMove,
  };
};
