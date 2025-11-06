import { cache, type Layer, type Properties } from ".";

export const createContainer = (children: Layer[]) => {
  const dispose = () => children.forEach(_ => _.dispose());
  return {
    children,
    dispose,
  };
};

export type DynamicContainerProperties<K> = {
  keys: K[];
  create: (_: K) => Layer;
};

export const createDynamicContainer = <K>(
  properties: Properties<DynamicContainerProperties<K>>,
) => {
  const { keys, create } = properties;

  const layers = new Map<K, Layer>();

  const dispose = () => [...layers.values()].forEach(_ => _.dispose());

  const update = cache(keys, keys => {
    [...layers.keys()]
      .filter(key => !keys.includes(key))
      .forEach(key => {
        layers.get(key)?.dispose();
        layers.delete(key);
      });
    keys.forEach(key => {
      const layer = layers.get(key) ?? create(key);
      layers.set(key, layer);
    });
  });

  return {
    get children() {
      update();
      return [...layers.values()];
    },
    dispose,
  } satisfies Layer;
};

export const createRenderLayer = (render: () => void) => {
  const dispose = () => {};

  return {
    render,
    dispose,
  } satisfies Layer;
};

export const createEmptyLayer = () => {
  const dispose = () => {};
  return { dispose } satisfies Layer;
};
