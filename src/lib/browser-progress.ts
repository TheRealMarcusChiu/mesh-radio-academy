import { openProgress } from './progress.ts';

/** One shared store per page view, so every progress control sees the same state. */
export const progress = openProgress(() => window.localStorage);
export const PROGRESS_EVENT = 'mra:progress';
export const notify = () => document.dispatchEvent(new Event(PROGRESS_EVENT));
