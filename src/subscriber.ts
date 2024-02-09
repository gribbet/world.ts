export const createSubscriber = <T>() => {
  type Handler = (msg: T) => void;
  const handlers: Handler[] = [];

  const subscribe = (handler: Handler) => {
    handlers.push(handler);
    return () => {
      const index = handlers.indexOf(handler);
      if (index === -1) return;
      handlers.splice(index, 1);
    };
  };

  const emit = (msg: T) => handlers.forEach(handler => handler(msg));

  return {
    subscribe,
    emit,
  };
};
