import type { APIRoute } from 'astro';
import { toCsv } from '../../lib/field.ts';

/** Blank field-log template: header row only, RFC 4180 CRLF line endings. */
export const GET: APIRoute = () =>
  new Response(toCsv([]), { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
