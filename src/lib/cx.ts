/** Joins class names, skipping falsy values. Safe to use in server and client components. */
export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}
