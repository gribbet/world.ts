import { View } from "./viewport";

export interface Layer {
  render: (view: View) => void;
  depth: (view: View) => void;
  destroy: () => void;
}
