export interface ImageLoad {
  loaded: boolean;
  cancel: () => void;
}

export const loadImage: (_: {
  url: string;
  onLoad?: (image: HTMLImageElement) => void;
  onError?: (error: string) => void;
}) => ImageLoad = ({ url, onLoad, onError }) => {
  let loaded = false;

  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = async () => {
    loaded = true;
    onLoad?.(image);
  };
  image.onerror = (error) => onError?.(error.toString());
  image.src = url;

  const cancel = () => {
    if (!loaded) image.src = "";
  };

  return {
    get loaded() {
      return loaded;
    },
    cancel,
  };
};
