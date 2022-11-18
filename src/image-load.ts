const worker = new Worker(new URL("./image-load-worker.ts", import.meta.url), {
  type: "module",
});

export interface ImageLoad {
  loaded: boolean;
  cancel: () => void;
}

export const createImageLoad: (_: {
  url: string;
  onLoad: (image: ImageBitmap | undefined) => void;
}) => ImageLoad = ({ url, onLoad }) => {
  let loaded = false;

  const handler = ({ data }: MessageEvent) => {
    if (canceled || url !== data.url) return;
    worker.removeEventListener("message", handler);
    loaded = true;
    onLoad(data.image);
  };
  worker.addEventListener("message", handler);

  let canceled = false;
  const cancel = () => {
    canceled = true;
    worker.postMessage(["cancel", url]);
  };

  worker.postMessage(["load", url]);

  return {
    get loaded() {
      return loaded;
    },
    cancel,
  };
};
