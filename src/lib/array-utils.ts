/**
 * Array and Object Manipulation Utilities
 *
 * Helper functions for working with arrays and objects.
 */

/**
 * Chunk array into smaller arrays of specified size
 *
 * Usage:
 * ```tsx
 * chunk([1, 2, 3, 4, 5], 2); // [[1, 2], [3, 4], [5]]
 * ```
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Remove duplicates from array
 */
export function unique<T>(array: T[]): T[] {
  return Array.from(new Set(array));
}

/**
 * Remove duplicates by key
 */
export function uniqueBy<T>(array: T[], key: keyof T): T[] {
  const seen = new Set();
  return array.filter((item) => {
    const value = item[key];
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

/**
 * Group array by key
 *
 * Usage:
 * ```tsx
 * const items = [{ type: 'a', value: 1 }, { type: 'b', value: 2 }, { type: 'a', value: 3 }];
 * groupBy(items, 'type'); // { a: [{ type: 'a', value: 1 }, { type: 'a', value: 3 }], b: [{ type: 'b', value: 2 }] }
 * ```
 */
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const groupKey = String(item[key]);
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(item);
    return groups;
  }, {} as Record<string, T[]>);
}

/**
 * Sort array by key
 */
export function sortBy<T>(array: T[], key: keyof T, order: 'asc' | 'desc' = 'asc'): T[] {
  return [...array].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];

    if (aVal < bVal) return order === 'asc' ? -1 : 1;
    if (aVal > bVal) return order === 'asc' ? 1 : -1;
    return 0;
  });
}

/**
 * Shuffle array randomly
 */
export function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Get random item from array
 */
export function randomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Get random items from array
 */
export function randomItems<T>(array: T[], count: number): T[] {
  const shuffled = shuffle(array);
  return shuffled.slice(0, count);
}

/**
 * Flatten nested array
 */
export function flatten<T>(array: any[]): T[] {
  return array.reduce(
    (flat, item) => flat.concat(Array.isArray(item) ? flatten(item) : item),
    []
  );
}

/**
 * Find intersection of arrays
 */
export function intersection<T>(...arrays: T[][]): T[] {
  if (arrays.length === 0) return [];
  return arrays.reduce((a, b) => a.filter((item) => b.includes(item)));
}

/**
 * Find difference between arrays (items in first but not in second)
 */
export function difference<T>(array1: T[], array2: T[]): T[] {
  return array1.filter((item) => !array2.includes(item));
}

/**
 * Find union of arrays (all unique items)
 */
export function union<T>(...arrays: T[][]): T[] {
  return unique(flatten(arrays));
}

/**
 * Partition array based on predicate
 *
 * Usage:
 * ```tsx
 * partition([1, 2, 3, 4, 5], x => x % 2 === 0); // [[2, 4], [1, 3, 5]]
 * ```
 */
export function partition<T>(array: T[], predicate: (item: T) => boolean): [T[], T[]] {
  const pass: T[] = [];
  const fail: T[] = [];

  array.forEach((item) => {
    if (predicate(item)) {
      pass.push(item);
    } else {
      fail.push(item);
    }
  });

  return [pass, fail];
}

/**
 * Count occurrences in array
 */
export function countBy<T>(array: T[], key?: keyof T): Record<string, number> {
  return array.reduce((counts, item) => {
    const countKey = key ? String(item[key]) : String(item);
    counts[countKey] = (counts[countKey] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
}

/**
 * Sum array values
 */
export function sum(array: number[]): number {
  return array.reduce((total, num) => total + num, 0);
}

/**
 * Sum array by key
 */
export function sumBy<T>(array: T[], key: keyof T): number {
  return array.reduce((total, item) => total + (Number(item[key]) || 0), 0);
}

/**
 * Calculate average
 */
export function average(array: number[]): number {
  return array.length === 0 ? 0 : sum(array) / array.length;
}

/**
 * Calculate median
 */
export function median(array: number[]): number {
  if (array.length === 0) return 0;

  const sorted = [...array].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Get min value
 */
export function min(array: number[]): number {
  return Math.min(...array);
}

/**
 * Get max value
 */
export function max(array: number[]): number {
  return Math.max(...array);
}

/**
 * Get min/max by key
 */
export function minBy<T>(array: T[], key: keyof T): T | undefined {
  return array.reduce((min, item) => (item[key] < min[key] ? item : min), array[0]);
}

export function maxBy<T>(array: T[], key: keyof T): T | undefined {
  return array.reduce((max, item) => (item[key] > max[key] ? item : max), array[0]);
}

/**
 * Deep clone object/array
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as any;
  if (obj instanceof Array) return obj.map((item) => deepClone(item)) as any;

  const cloned = {} as T;
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * Deep merge objects
 */
export function deepMerge<T extends Record<string, any>>(target: T, ...sources: Partial<T>[]): T {
  if (sources.length === 0) return target;

  const source = sources.shift();
  if (!source) return deepMerge(target, ...sources);

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        target[key] = deepMerge({ ...targetValue }, sourceValue as any);
      } else {
        target[key] = sourceValue as any;
      }
    }
  }

  return deepMerge(target, ...sources);
}

/**
 * Pick keys from object
 */
export function pick<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach((key) => {
    if (key in obj) {
      result[key] = obj[key];
    }
  });
  return result;
}

/**
 * Omit keys from object
 */
export function omit<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  keys.forEach((key) => {
    delete result[key];
  });
  return result;
}

/**
 * Get nested value safely
 *
 * Usage:
 * ```tsx
 * get({ a: { b: { c: 1 } } }, 'a.b.c'); // 1
 * get({ a: { b: { c: 1 } } }, 'a.b.x', 'default'); // 'default'
 * ```
 */
export function get<T = any>(
  obj: any,
  path: string,
  defaultValue?: T
): T {
  const keys = path.split('.');
  let result = obj;

  for (const key of keys) {
    if (result == null || typeof result !== 'object') {
      return defaultValue as T;
    }
    result = result[key];
  }

  return result !== undefined ? result : (defaultValue as T);
}

/**
 * Set nested value
 *
 * Usage:
 * ```tsx
 * set({}, 'a.b.c', 1); // { a: { b: { c: 1 } } }
 * ```
 */
export function set(obj: any, path: string, value: any): any {
  const keys = path.split('.');
  const lastKey = keys.pop()!;
  let current = obj;

  for (const key of keys) {
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }

  current[lastKey] = value;
  return obj;
}

/**
 * Check if object is empty
 */
export function isEmpty(obj: any): boolean {
  if (obj == null) return true;
  if (Array.isArray(obj) || typeof obj === 'string') return obj.length === 0;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  return false;
}

/**
 * Compact array (remove falsy values)
 */
export function compact<T>(array: (T | null | undefined | false | 0 | '')[]): T[] {
  return array.filter(Boolean) as T[];
}

/**
 * Create range array
 *
 * Usage:
 * ```tsx
 * range(5); // [0, 1, 2, 3, 4]
 * range(1, 5); // [1, 2, 3, 4]
 * range(0, 10, 2); // [0, 2, 4, 6, 8]
 * ```
 */
export function range(start: number, end?: number, step: number = 1): number[] {
  if (end === undefined) {
    end = start;
    start = 0;
  }

  const result: number[] = [];
  for (let i = start; i < end; i += step) {
    result.push(i);
  }
  return result;
}

/**
 * Zip arrays together
 *
 * Usage:
 * ```tsx
 * zip([1, 2], ['a', 'b']); // [[1, 'a'], [2, 'b']]
 * ```
 */
export function zip<T>(...arrays: T[][]): T[][] {
  const maxLength = Math.max(...arrays.map((arr) => arr.length));
  return range(maxLength).map((i) => arrays.map((arr) => arr[i]));
}

/**
 * Debounce function calls
 */
export function debounceArray<T>(array: T[], delay: number = 0): Promise<T[]> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(array), delay);
  });
}

/**
 * Move array item
 */
export function moveItem<T>(array: T[], fromIndex: number, toIndex: number): T[] {
  const result = [...array];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

/**
 * Toggle item in array
 */
export function toggleItem<T>(array: T[], item: T): T[] {
  const index = array.indexOf(item);
  if (index === -1) {
    return [...array, item];
  }
  return array.filter((_, i) => i !== index);
}
