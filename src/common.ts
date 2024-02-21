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

export const cache = <T extends unknown[], R>(f: (..._: T) => R) => {
  let last: [T, R] | undefined;
  return (...args: T) => {
    if (last) {
      const [lastArgs, lastResult] = last;
      if (lastArgs.every((_, i) => args[i] === _)) return lastResult;
    }
    const result = f(...args);
    last = [args, result];
    return result;
  };
};
