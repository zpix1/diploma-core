export function* combinations<T>(
  array: T[],
  length: number
): IterableIterator<T[]> {
  for (let i = 0; i < array.length; i++) {
    if (length === 1) {
      yield [array[i]];
    } else {
      const remaining = combinations(
        array.slice(i + 1, array.length),
        length - 1
      );
      for (const next of remaining) {
        yield [array[i], ...next];
      }
    }
  }
}
