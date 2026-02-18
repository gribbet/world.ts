import type { quat, vec2, vec3, vec4 } from "gl-matrix";

import type { Viewport } from "../viewport";
export * from "./billboard";
export * from "./container";
export * from "./line";
export * from "./object";
export * from "./polygon";
export * from "./terrain";
export * from "./text";
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
  saturation: number;
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
  uvs: vec2[];
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
  textureUrl?: string;
} & LayerOptions;

export type Billboard = {
  url: string;
  position: vec3;
  color: vec4;
  size: number;
  offset?: vec2;
  minScale?: number;
  maxScale?: number;
  minSizePixels?: number;
  maxSizePixels?: number;
} & LayerOptions;

export type Text = {
  text: string;
  position: vec3;
  color: vec4;
  size: number;
  offset?: vec2;
  fontFamily?: string;
  fontWeight?: string;
  fontSize?: number;
  fillColor?: vec4;
  outlineWidth?: number;
  outlineColor?: vec4;
  minScale?: number;
  maxScale?: number;
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

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export type Accessor<T> = T | (() => T);

export const resolve = <T>(_: Accessor<T>) =>
  typeof _ === "function" ? (_ as () => T)() : _;

export type Properties<T> = {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  [K in keyof T]: [T[K]] extends [Function | undefined] ? T[K] : Accessor<T[K]>;
};

export const cacheAll = <T extends unknown[], R>(
  _value: {
    [K in keyof T]: Accessor<T[K]>;
  },
  f: (args: T) => R,
): Accessor<R> => {
  const n = _value.length;
  let last: [T, R] | undefined;
  let value = new Array(n).fill(undefined) as unknown as T;
  return () => {
    for (let i = 0; i < n; i++) value[i] = resolve(_value[i]);
    if (last !== undefined) {
      let match = true;
      for (let i = 0; i < n; i++)
        if (last[0][i] !== value[i]) {
          match = false;
          break;
        }

      if (match) return last[1];
    }
    const result = f(value);
    if (last === undefined) last = [value.slice() as unknown as T, result];
    else {
      const [temp] = last;
      last[0] = value;
      last[1] = result;
      value = temp;
    }
    return result;
  };
};

export const cache = <T, R>(_: Accessor<T>, f: (_: T) => R): Accessor<R> => {
  let lastValue: T;
  let lastResult: R;
  let initialized = false;

  return () => {
    const value = resolve(_);
    if (initialized && lastValue === value) return lastResult;
    const result = f(value);
    lastValue = value;
    lastResult = result;
    initialized = true;
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
