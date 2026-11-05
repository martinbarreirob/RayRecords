import { z } from 'zod';
import { isValidDateOnly } from '../dates';

export const ObjectIdString = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');

export const DateOnlySchema = z
  .string()
  .refine(isValidDateOnly, 'Invalid date, expected YYYY-MM-DD');

export const MonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid month, expected YYYY-MM');

export const TimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time, expected HH:mm');

export const IsoDateTime = z.iso.datetime();

/** Amounts are always integer cents, never floats. */
export const Cents = z.number().int().safe();

/** http(s) only, so `javascript:` and similar cannot end up in rendered links. */
export const HttpUrl = z.url({ protocol: /^https?$/ });

export const TagSchema = z.string().trim().toLowerCase().min(1).max(40);

/** Field keys: no `$` or `.`, so they cannot become Mongo operators. */
export const FIELD_KEY_RE = /^[a-z][a-zA-Z0-9_]{0,39}$/;
export const FieldKey = z.string().regex(FIELD_KEY_RE);

/** Value of an `extra` field: flat scalars, no nested objects. */
export const ExtraValue = z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]);
/** At most 50 keys, so a request cannot store an unbounded object. */
export const ExtraSchema = z
  .record(FieldKey, ExtraValue)
  .refine((value) => Object.keys(value).length <= 50, 'Too many fields');
export type Extra = z.infer<typeof ExtraSchema>;
