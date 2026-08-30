import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Klassen zusammenfuehren; spaetere Tailwind-Utilities gewinnen. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
