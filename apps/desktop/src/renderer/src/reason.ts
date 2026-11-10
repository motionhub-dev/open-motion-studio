/** Electron prefixes an error thrown in a handler with where it came from; the person needs only the reason. */
export function reason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
