import { DateTime } from 'luxon';
import { BadRequestException } from '@nestjs/common';

/** Parse a YYYY-MM-DD calendar date into a Date at 00:00 UTC. */
export function parseDateOnly(value: string, field = 'date'): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) {
    throw new BadRequestException({ message: `${field} must be a date in YYYY-MM-DD format`, field });
  }
  const dt = DateTime.fromISO(value, { zone: 'utc' });
  if (!dt.isValid) throw new BadRequestException({ message: `${field} is not a valid date`, field });
  return dt.toJSDate();
}

export function formatDateOnly(d: Date): string {
  return DateTime.fromJSDate(d, { zone: 'utc' }).toISODate() as string;
}

export function addDays(d: Date, days: number): Date {
  return DateTime.fromJSDate(d, { zone: 'utc' }).plus({ days }).toJSDate();
}

export function todayUtc(): Date {
  return DateTime.utc().startOf('day').toJSDate();
}

/** Today's calendar date in an IANA zone, as the same UTC-midnight Date used for stored date-only values. */
export function todayInZone(zone: string): Date {
  const local = DateTime.now().setZone(zone).toISODate() as string;
  return DateTime.fromISO(local, { zone: 'utc' }).toJSDate();
}

/** All calendar dates d with start <= d < endExclusive (UTC midnights). */
export function eachNight(start: Date, endExclusive: Date): Date[] {
  const out: Date[] = [];
  let cur = DateTime.fromJSDate(start, { zone: 'utc' }).startOf('day');
  const end = DateTime.fromJSDate(endExclusive, { zone: 'utc' }).startOf('day');
  while (cur < end) {
    out.push(cur.toJSDate());
    cur = cur.plus({ days: 1 });
  }
  return out;
}

export function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000);
}

/**
 * FLT-03 / GEN-06: convert a local date-time entered for an airport's IANA zone to UTC.
 * Accepts "YYYY-MM-DDTHH:mm" (or with seconds). Rejects offsets to avoid ambiguity.
 */
export function localToUtc(local: string, zone: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local ?? '')) {
    throw new BadRequestException({
      message: `${field} must be a local date-time in the airport's time zone, format YYYY-MM-DDTHH:mm`,
      field,
    });
  }
  const dt = DateTime.fromISO(local, { zone });
  if (!dt.isValid) throw new BadRequestException({ message: `${field} is not a valid date-time`, field });
  // A wall-clock time skipped by a daylight-saving change (e.g. 02:30 when clocks jump 02:00 -> 03:00) does not exist.
  if (dt.toFormat("yyyy-MM-dd'T'HH:mm") !== local.slice(0, 16)) {
    throw new BadRequestException({ message: `${field} ${local.slice(0, 16)} does not exist in ${zone} (daylight-saving time change)`, field });
  }
  return dt.toUTC().toJSDate();
}

export function utcToLocalIso(d: Date, zone: string): string {
  return DateTime.fromJSDate(d).setZone(zone).toFormat("yyyy-MM-dd'T'HH:mm");
}

export function localDateOf(d: Date, zone: string): string {
  return DateTime.fromJSDate(d).setZone(zone).toISODate() as string;
}

/** FLT-12 (b): passenger age (in whole years) on a given date. */
export function ageOn(dob: Date, on: Date): number {
  const b = DateTime.fromJSDate(dob, { zone: 'utc' });
  const o = DateTime.fromJSDate(on, { zone: 'utc' });
  return Math.floor(o.diff(b, 'years').years);
}

export function isValidTimeHHmm(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}
