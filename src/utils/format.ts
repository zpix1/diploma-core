type StringLiteral<T> = T extends string
  ? string extends T
    ? never
    : T
  : never;
export const toStringify = <T>(
  obj: Record<StringLiteral<T>, any>,
  ...props: T[]
): void => {
  for (const prop of Object.keys(obj)) {
    if (props.includes(prop as T)) {
      obj[prop as StringLiteral<T>] = obj[prop as StringLiteral<T>].toString();
    }
  }
};
