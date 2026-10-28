// Server-only runtime configuration. Never return these values from a handler.
export function getServerEnv(name: string): string {
  const runtime = globalThis as typeof globalThis & {
    Netlify?: { env?: { get: (key: string) => string | undefined } };
  };
  return runtime.Netlify?.env?.get(name)?.trim() || process.env[name]?.trim() || "";
}
