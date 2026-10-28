import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const SENSITIVE_SETTING_KEYS = new Set(["ai_key", "ollama_api_key", "secret_key"]);

export function filterPublicSettings(
  rows: { key: string; value: string }[] | null | undefined,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of rows ?? []) {
    // Confidential keys must never be exposed to public client queries
    if (SENSITIVE_SETTING_KEYS.has(r.key)) continue;
    map[r.key] = r.value;
  }
  return map;
}

// Admin-editable site text and options, stored as key/value rows.
// Confidential keys are filtered out to keep API keys secure.
export function useSiteSettings(): Record<string, string> {
  const { data } = useQuery({
    queryKey: ["site-settings"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("key, value");
      return filterPublicSettings(data);
    },
  });
  return data ?? {};
}

export async function saveSiteSetting(key: string, value: string) {
  return supabase
    .from("site_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() });
}

export function resolveAiEndpoint(rawUrl?: string): string {
  const u = (rawUrl ?? "").trim();
  if (
    !u ||
    u.includes("chatgpt.com") ||
    u.includes("claude.ai") ||
    u.includes("gemini.google.com") ||
    !u.startsWith("http")
  ) {
    return "https://ollama.com/api/chat";
  }
  return u;
}

export function resolveAiModel(rawModel?: string): string {
  const m = (rawModel ?? "").trim();
  if (
    !m ||
    m.toLowerCase() === "mfp assistant" ||
    m.toLowerCase() === "assistant" ||
    m.toLowerCase().startsWith("mfp")
  ) {
    return "gpt-oss:120b";
  }
  return m;
}

// Camera inference needs an image-capable model independently of MFP chat.
export function resolveVisionModel(rawModel?: string): string {
  return rawModel?.trim() || "qwen3-vl:235b-cloud";
}
