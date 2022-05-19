import { View } from "../viewport";

export * from "./line";
export * from "./terrain";

export interface Layer {
  render: (view: View) => void;
  depth: (view: View) => void;
  destroy: () => void;
}
