import { randomBytes } from 'crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Generates a human-friendly unique booking reference such as FL-7KQ2M9XA. Uniqueness is also enforced by a DB index. */
export function generateBookingReference(prefix: 'FL' | 'HT'): string {
  const bytes = randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix}-${s}`;
}
