/** Escape user input before using it inside a MongoDB $regex (prevents ReDoS / injection). */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function containsInsensitive(input: string): RegExp {
  return new RegExp(escapeRegex(input.trim()), 'i');
}
