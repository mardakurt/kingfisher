/**
 * Join class names, dropping falsy values.
 *
 * Intentionally not `clsx` + `tailwind-merge`: components here compose classes
 * additively and never rely on later utilities overriding earlier ones, so the
 * 8 kB of conflict resolution would buy nothing.
 */
export type ClassValue = string | false | null | undefined;

export const cn = (...values: ClassValue[]): string => values.filter(Boolean).join(' ');
