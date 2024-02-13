import type { quat, vec3, vec4 } from "gl-matrix";

import type { Viewport } from "../viewport";
import type { BillboardLayer } from "./billboard";
import type { LineLayer } from "./line";
import type { MeshLayer } from "./mesh";
import type { PolygonLayer } from "./polygon";
import type { TerrainLayer } from "./terrain";

export type LayerOptions = {
  pickable: boolean;
  depth: boolean;
  polygonOffset: number;
};

export type Terrain = {
  options: Partial<LayerOptions>;
  readonly terrainUrl: string;
  readonly imageryUrl: string;
  color: vec4;
};

export type Line = {
  options: Partial<LayerOptions>;
  points: vec3[][];
  color: vec4;
  width: number;
  minWidthPixels?: number | undefined;
  maxWidthPixels?: number | undefined;
};

export type Polygon = {
  options: Partial<LayerOptions>;
  points: vec3[][];
  color: vec4;
};

export type Mesh = {
  options: Partial<LayerOptions>;
  vertices: vec3[];
  indices: vec3[];
  position: vec3;
  orientation: quat;
  color: vec4;
  size: number;
  minSizePixels?: number;
  maxSizePixels?: number;
};

export type Billboard = {
  options: Partial<LayerOptions>;
  url: string;
  position: vec3;
  color: vec4;
  size: number;
  minSizePixels?: number;
  maxSizePixels?: number;
};

export type Layer =
  | TerrainLayer
  | LineLayer
  | PolygonLayer
  | MeshLayer
  | BillboardLayer;

export type BaseLayer = {
  render: (_: { viewport: Viewport; depth?: boolean; index?: number }) => void;
  destroy: () => void;
};
