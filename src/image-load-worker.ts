export type Data = ["load" | "cancel", string];

addEventListener("message", async event => {
  const [action, url] = event.data as Data;
  if (action !== "load") return;
  const abortController = new AbortController();
  const { signal } = abortController;
  const handler = (event: MessageEvent) => {
    const [action, thisUrl] = event.data as Data;
    if (action === "cancel" && thisUrl === url) abortController.abort();
  };
  addEventListener("message", handler);
  try {
    const response = await fetch(url, { mode: "cors", signal });
    if (!response.ok) {
      postMessage({ url, image: undefined });
      return;
    }
    const blob = await response.blob();
    const image = await createImageBitmap(blob);
    postMessage({ url, image });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    if (
      error.message === "The user aborted a request." ||
      error.message.startsWith("signal is aborted without reason")
    )
      // Ignore
      return;
    else if (error.message === "Failed to fetch") {
      // Network error (eg. CORS issue)
      postMessage({ url, image: undefined });
      return;
    }
    throw error;
  } finally {
    removeEventListener("message", handler);
  }
});
