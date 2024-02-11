import type { quat, vec3, vec4 } from "gl-matrix";

import type { Viewport } from "../viewport";
import type { LineLayer } from "./line";
import type { MeshLayer } from "./mesh";
import type { TerrainLayer } from "./terrain";

export type LayerOptions = {
  pickable: boolean;
};

export type Terrain = LayerOptions & {
  readonly terrainUrl: string;
  readonly imageryUrl: string;
  color: vec4;
};

export type Mesh = LayerOptions & {
  vertices: vec3[];
  indices: vec3[];
  position: vec3;
  orientation: quat;
  color: vec4;
  size: number;
  minSizePixels?: number;
  maxSizePixels?: number;
};

export type Line = LayerOptions & {
  points: vec3[];
  color: vec4;
  width: number;
  minWidthPixels?: number | undefined;
  maxWidthPixels?: number | undefined;
} & LayerOptions;

export type BaseLayer = {
  render: (_: { viewport: Viewport; depth?: boolean; index?: number }) => void;
  destroy: () => void;
};

export type Layer = TerrainLayer | MeshLayer | LineLayer;
