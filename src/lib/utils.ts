import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The handoff type scale (globals.css --text-*) are font sizes, not colours; without this twMerge drops
// `text-label` when a `text-<colour>` class follows it.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: ['h1', 'h2', 'row', 'button', 'body', 'meta', 'label', 'tag'] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
