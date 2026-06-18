/**
 * Recursively freeze an object/array and everything it references, so exported
 * singletons (the command catalog, the tool list) cannot be mutated by consumers.
 * Returns the same value (now frozen) for convenient inline use.
 */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      deepFreeze(v);
    }
    Object.freeze(value);
  }
  return value;
}
