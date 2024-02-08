import { View, Viewport } from "../viewport";

export * from "./line";
export * from "./terrain";

export type Layer = {
  render: (_: { viewport: Viewport; depth?: boolean; index?: number }) => void;
  destroy: () => void;
};
