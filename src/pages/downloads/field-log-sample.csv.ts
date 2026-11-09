import type { APIRoute } from 'astro';
import { toCsv } from '../../lib/field.ts';
import { SAMPLE_LOG } from '../../fixtures/field.ts';

/** Synthetic sample field log (fictional places, invented counts), same rows as the lab page. */
export const GET: APIRoute = () =>
  new Response(toCsv(SAMPLE_LOG), { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
