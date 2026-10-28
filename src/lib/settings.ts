import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Admin-editable site text and options, stored as key/value rows.
export function useSiteSettings(): Record<string, string> {
  const { data } = useQuery({
    queryKey: ["site-settings"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("key, value");
      const map: Record<string, string> = {};
      for (const r of data ?? []) map[r.key] = r.value;
      return map;
    },
  });
  return data ?? {};
}

export async function saveSiteSetting(key: string, value: string) {
  return supabase.from("site_settings").upsert({ key, value, updated_at: new Date().toISOString() });
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
