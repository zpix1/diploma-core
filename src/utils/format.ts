export const objMap = <T extends Record<string, any>>(
  t: T,
  funs: {
    [k in keyof T]?: (v: T[k]) => any;
  }
): any => {
  return Object.fromEntries(
    Object.entries(t).map(([key, value]) => {
      return [key, funs[key]?.(value) ?? value];
    })
  );
};
