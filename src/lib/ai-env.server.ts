// Read credentials only inside server functions; never import into client code.
export function getOllamaApiKey(): string {
  const runtime = globalThis as typeof globalThis & {
    Netlify?: { env?: { get: (name: string) => string | undefined } };
  };
  return (
    runtime.Netlify?.env?.get("OLLAMA_API_KEY")?.trim() ||
    process.env["OLLAMA_API_KEY"]?.trim() ||
    ""
  );
}
