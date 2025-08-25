// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const debounce = <F extends (...args: any[]) => void>(
  f: F,
  delay: number,
) => {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<F>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => f(...args), delay);
  };
};

export const range = (start: number, end: number) =>
  Array.from({ length: end - start }, (_, k) => k + start);
