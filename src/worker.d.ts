declare module "*?worker&inline" {
  const factory: () => Worker;
  export default factory;
}
