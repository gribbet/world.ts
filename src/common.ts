export const debounce = <F extends (...args: unknown[]) => void>(
  f: F,
  delay: number,
) => {
  let timeout: number;
  return (...args: Parameters<F>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => f(args), delay);
  };
};

export const range = (start: number, end: number) =>
  Array.from({ length: end - start }, (_, k) => k + start);
