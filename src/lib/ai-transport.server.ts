import OpenAI from "openai";

export const DEEPSEEK_MODEL = "deepseek/deepseek-v4-flash";
type Message = { role: "system" | "user" | "assistant"; content: string; images?: string[] | undefined };
type RequestBody = {
  model: string; messages: Message[]; stream: boolean;
  options?: { num_predict: number }; max_tokens?: number;
  format?: string; response_format?: { type: "json_object" };
};

// DeepSeek composes text; Ollama supplies live evidence upstream, handles photos,
// and remains available as a fallback. Neither credential crosses providers.
export async function requestAi(
  url: string, ollamaKey: string, body: RequestBody, timeoutMs: number,
): Promise<Response> {
  const started = Date.now();
  const photos = body.messages.some((message) => message.images?.length);
  if (!photos) {
    try {
      // The official SDK automatically uses Netlify's runtime gateway configuration.
      const client = new OpenAI({ maxRetries: 0, timeout: Math.min(20000, ollamaKey ? Math.max(1000, Math.floor(timeoutMs * 0.65)) : timeoutMs) });
      const response = await client.chat.completions.create({
        model: DEEPSEEK_MODEL,
        messages: body.messages.map(({ role, content }) => ({ role, content })),
        stream: false,
        max_tokens: body.max_tokens ?? body.options?.num_predict ?? 16000,
        ...(body.format === "json" || body.response_format ? { response_format: { type: "json_object" as const } } : {}),
      });
      const content = response.choices[0]?.message?.content;
      if (content?.trim()) return Response.json({ message: { content } });
    } catch {
      // Never log provider errors: they can contain request headers or private text.
    }
  }
  const remaining = timeoutMs - (Date.now() - started);
  if (!ollamaKey || remaining < 1000) return new Response(null, { status: 503 });
  return fetch(url, {
    method: "POST", signal: AbortSignal.timeout(remaining),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ollamaKey}` },
    body: JSON.stringify(body),
  });
}

export async function testDeepSeek(): Promise<boolean> {
  try {
    const client = new OpenAI({ maxRetries: 0, timeout: 12000 });
    const response = await client.chat.completions.create({
      model: DEEPSEEK_MODEL, max_tokens: 32,
      messages: [{ role: "user", content: "Reply with OK." }],
    });
    return !!response.choices[0]?.message?.content?.trim();
  } catch { return false; }
}
