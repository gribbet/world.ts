import { quat, vec3, vec4 } from "gl-matrix";
import { Viewport } from "../viewport";

import { TerrainLayer } from "./terrain";
import { MeshLayer } from "./mesh";
import { LineLayer } from "./line";

export type Terrain = {
  terrainUrl: string;
  imageryUrl: string;
};

export type Mesh = {
  vertices: vec3[];
  indices: vec3[];
  position: vec3;
  orientation: quat;
  color: vec4;
  size: number;
  minSizePixels?: number;
  maxSizePixels?: number;
};

export type Line = {
  points: vec3[];
  color: vec4;
  width: number;
  minWidthPixels?: number | undefined;
  maxWidthPixels?: number | undefined;
};

export type LayerEvents = {
  onMouseDown?: (position: vec3) => void;
};

export type BaseLayer = {
  render: (_: { viewport: Viewport; depth?: boolean; index?: number }) => void;
  destroy: () => void;
} & LayerEvents;

export type Layer = TerrainLayer | MeshLayer | LineLayer;
