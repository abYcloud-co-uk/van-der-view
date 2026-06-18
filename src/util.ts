/**
 * Type guard for a non-null, non-array plain object. The executor and the
 * provider adapters treat anything else (primitives, arrays, null) as
 * structurally invalid input.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
