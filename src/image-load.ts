import createImageLoadWorker from "./image-load-worker?worker&inline";

const worker = createImageLoadWorker();

export type ImageLoad = {
  loaded: boolean;
  cancel: () => void;
};

export const createImageLoad = ({
  url,
  onLoad,
}: {
  url: string;
  onLoad: (image: ImageBitmap | undefined) => void;
}) => {
  let loaded = false;

  const handler = (event: MessageEvent) => {
    const data = event.data as { url: string; image?: ImageBitmap };
    if (canceled || url !== data.url) return;
    worker.removeEventListener("message", handler);
    if (!data.image) return;
    loaded = true;
    onLoad(data.image);
  };
  worker.addEventListener("message", handler);

  let canceled = false;
  const cancel = () => {
    if (loaded) return;
    canceled = true;
    worker.postMessage(["cancel", url]);
  };

  worker.postMessage(["load", url]);

  return {
    get loaded() {
      return loaded;
    },
    cancel,
  } satisfies ImageLoad;
};
