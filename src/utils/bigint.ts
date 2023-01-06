export const bigIntMinAndMax = (...args: bigint[]): [bigint, bigint] => {
  return args.reduce(
    ([min, max], e) => {
      return [e < min ? e : min, e > max ? e : max];
    },
    [args[0], args[0]]
  );
};
