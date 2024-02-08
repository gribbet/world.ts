import { View, Viewport } from "../viewport";

export * from "./line";
export * from "./terrain";

export type Layer = {
  render: (view: Viewport) => void;
  depth: (view: Viewport, i: number) => void;
  destroy: () => void;
};
