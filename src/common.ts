export const debounce = (f: (...args: any[]) => void, delay: number) => {
  let timeout: number;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => f(args), delay);
  };
};

export const range = (start: number, end: number) =>
  Array.from({ length: end - start }, (_, k) => k + start);
