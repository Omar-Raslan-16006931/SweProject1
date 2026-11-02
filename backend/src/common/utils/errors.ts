import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

export const notFound = (what: string) => new NotFoundException({ message: `${what} not found` });
export const forbidden = (message = 'You are not allowed to perform this action') =>
  new ForbiddenException({ message });
export const conflict = (message: string) => new ConflictException({ message });

export function isDuplicateKeyError(err: any): boolean {
  return err && (err.code === 11000 || err?.writeErrors?.some?.((e: any) => e.code === 11000));
}
