import type { Context } from "../context";
import type { Properties, Text } from ".";
import { cacheAll } from ".";
import { createBillboardLayer } from "./billboard";

const canvas = document.createElement("canvas");

export const createTextLayer = (
  context: Context,
  properties: Properties<Partial<Text>> = {},
) => {
  const {
    text,
    fontFamily,
    fontWeight,
    fontSize,
    fillColor,
    outlineWidth,
    outlineColor,
  } = properties;

  const url = cacheAll(
    [
      text,
      fontFamily,
      fontWeight,
      fontSize,
      fillColor,
      outlineWidth,
      outlineColor,
    ] as const,
    ([
      text = "",
      fontFamily = "sans-serif",
      fontWeight = "normal",
      fontSize = 16,
      fillColor = [1, 1, 1, 1],
      outlineWidth = 0,
      outlineColor = [0, 0, 0, 1],
    ]) => {
      const context = canvas.getContext("2d");
      if (!context) return;
      context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      const metrics = context.measureText(text);
      const width = Math.ceil(metrics.width) + outlineWidth * 2;
      const height = fontSize + outlineWidth * 2;
      canvas.width = width;
      canvas.height = height;

      context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      context.textAlign = "center";
      context.textBaseline = "middle";

      context.clearRect(0, 0, width, height);

      const [r = 1, g = 1, b = 1, a = 1] = fillColor;
      const [ro = 0, go = 0, bo = 0, ao = 1] = outlineColor;

      if (outlineWidth > 0) {
        context.lineWidth = outlineWidth * 2;
        context.strokeStyle = `rgba(${ro * 255},${go * 255},${bo * 255},${ao * a})`;
        context.strokeText(text, width / 2, height / 2);
      }

      context.fillStyle = `rgba(${r * 255},${g * 255},${b * 255},${a})`;
      context.fillText(text, width / 2, height / 2);

      return canvas.toDataURL();
    },
  );

  return createBillboardLayer(context, {
    ...properties,
    url,
  });
};
