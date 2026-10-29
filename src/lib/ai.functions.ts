import { CONCISE_REPLY_GUIDANCE, needsDetailedReply, needsLiveLookup } from "./mfp-response-policy";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { normalizeChatTimes, stripChatCitations, stripUnrequestedLinks, wantsLinks } from "./chat-presentation";
import { TEXTBOOK_TEACHING_GUIDANCE } from "./mfp-textbook";
import { hasQuizBatch, practiceQuizCount, stripWaitingPlaceholder } from "./mfp-study";
import { getServerEnv } from "./server-env.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveAiEndpoint, resolveAiModel, resolveVisionModel } from "@/lib/settings";

import { DEEPSEEK_MODEL, requestAi, testDeepSeek } from "./ai-transport.server";

const Msg = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(20000),
  images: z.array(z.string().max(6_000_000)).max(1).optional(),
});

// DeepSeek handles text. Existing Ollama settings provide search, vision and fallback.
export const mfpChat = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ messages: z.array(Msg).min(1).max(30), timezone: z.string().max(100).optional() }).parse(d))
  .handler(async ({ data }) => {
    try {
      return await runChat(data.messages, undefined, { timezone: data.timezone ?? "UTC" });
    } catch (e) {
      console.error("MFP AI failure");
      return {
        ok: false as const,
        error: "The assistant took too long or is unavailable. Please try again.",
      };
    }
  });

// Admin-only: check whether an AI key is configured (without leaking the secret).
export const getAiKeyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: rows } = await context.supabase
      .from("site_settings")
      .select("key,value")
      .in("key", ["ai_url", "ai_model", "ai_key", "ollama_api_key", "ai_vision_model"]);

    const cfg: Record<string, string> = {};
    for (const r of rows ?? []) cfg[r.key] = r.value;

    const envKey = getServerEnv("OLLAMA_API_KEY");
    const dbKey = cfg["ai_key"] || cfg["ollama_api_key"];
    const activeKey = envKey || dbKey || "";

    return {
      configured: Boolean(activeKey),
      primaryModel: DEEPSEEK_MODEL,
      primaryProvider: "Netlify AI Gateway",
      source: envKey
        ? "Netlify environment variable"
        : dbKey
          ? "Admin database setting"
          : "Not configured",
      masked: activeKey ? "••••••••" : "",
      endpoint: resolveAiEndpoint(cfg["ai_url"]),
      model: resolveAiModel(cfg["ai_model"]),
    };
  });

// Admin-only: test the AI connection with candidate or configured key.
export const testAiConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ candidateKey: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: rows } = await context.supabase
      .from("site_settings")
      .select("key,value")
      .in("key", ["ai_url", "ai_model", "ai_key", "ollama_api_key", "ai_vision_model"]);

    const cfg: Record<string, string> = {};
    for (const r of rows ?? []) cfg[r.key] = r.value;

    const candidate = (data.candidateKey ?? "").trim();
    const key =
      candidate || getServerEnv("OLLAMA_API_KEY") || cfg["ai_key"] || cfg["ollama_api_key"];

    const deepseek = await testDeepSeek();
    if (!key) {
      return { ok: false as const, error: `DeepSeek ${deepseek ? "responded" : "could not be reached"}. Ollama live lookup and fallback are not configured.` };
    }

    const url = resolveAiEndpoint(cfg["ai_url"]);
    const model = resolveAiModel(cfg["ai_model"]);

    try {
      const res = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [{ role: "user", content: "ping" }],
        }),
      });

      if (!res.ok) {
        return {
          ok: false as const,
          error: aiHttpError(res.status),
        };
      }

      if (!deepseek) return { ok: false as const, error: "Ollama responded, but DeepSeek could not be reached. Ollama fallback remains available." };
      return { ok: true as const, model: `${DEEPSEEK_MODEL} + Ollama (${model})` };
    } catch {
      return { ok: false as const, error: "AI connection timed out or could not be reached." };
    }
  });

export async function runChat(
  messages: z.infer<typeof Msg>[],
  instruction?: string,
  options?: {
    timeoutMs?: number;
    timezone?: string;
    json?: boolean;
    settingsClient?: { from: (table: string) => any };
  },
): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  const { createClient } = await import("@supabase/supabase-js");
  const pk =
    getServerEnv("SUPABASE_PUBLISHABLE_KEY") ||
    getServerEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ||
    (typeof import.meta !== "undefined" &&
      (import.meta as { env?: Record<string, string> }).env?.["VITE_SUPABASE_PUBLISHABLE_KEY"]) ||
    "";
  const sbUrl =
    getServerEnv("SUPABASE_URL") ||
    getServerEnv("VITE_SUPABASE_URL") ||
    (typeof import.meta !== "undefined" &&
      (import.meta as { env?: Record<string, string> }).env?.["VITE_SUPABASE_URL"]) ||
    "";
  const sb =
    options?.settingsClient ??
    createClient(sbUrl, pk, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (pk.startsWith("sb_") && h.get("Authorization") === `Bearer ${pk}`)
            h.delete("Authorization");
          h.set("apikey", pk);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
  const { data: rows, error: settingsError } = await sb
    .from("site_settings")
    .select("key,value")
    .in("key", ["ai_url", "ai_model", "ai_key", "ollama_api_key", "ai_vision_model"]);
  if (settingsError)
    return {
      ok: false,
      error: "Could not load AI settings. Retry when the connection is restored.",
    };
  const cfg: Record<string, string> = {};
  for (const r of rows ?? []) cfg[r.key] = r.value;
  const key = getServerEnv("OLLAMA_API_KEY") || cfg["ai_key"] || cfg["ollama_api_key"] || "";

  const url = resolveAiEndpoint(cfg["ai_url"]);
  const model = messages.some((message) => message.images?.length)
    ? resolveVisionModel(cfg["ai_vision_model"]) : resolveAiModel(cfg["ai_model"]);

  // Only conversational chat uses live search; structured publishing and
  // visual assessment callers retain their task-specific instructions.
  const startedAt = Date.now();
  const quizCount = instruction ? undefined : practiceQuizCount(messages);
  const latestQuestion = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const detailed = needsDetailedReply(latestQuestion);
  const needsChecking = !!quizCount || detailed || needsLiveLookup(latestQuestion) || messages.some((m) => m.images?.length);
  const freshness = instruction || quizCount
    ? null
    : await (await import("./ai-freshness.server")).getFreshContext(messages, key, new Date(), options?.timezone, { encyclopedia: true, skipStableSearch: true });

  if (freshness?.directAnswer) return { ok: true as const, reply: freshness.directAnswer };

  const baseSystemPrompt =
    instruction ??
              (detailed ? TEXTBOOK_TEACHING_GUIDANCE + "\n\n" : "") +
              "You can read and explain mathematics in any subject, including algebra, calculus, geometry, science and business. You are MFP, the friendly Math & Finance Pro assistant. Accuracy is your top priority: work every calculation step by step and double-check it before answering, state facts only when you are confident or the supplied evidence supports them, and say plainly when something cannot be verified rather than guessing. Understand Tagalog, Filipino, mixed-language commands, and other languages supported by your model. Respond in the language requested by the user, otherwise use English as your main and default language. Follow instructions using the supplied conversation and images. Be clear about information you cannot access and actions you cannot perform. Teach like a patient, encouraging classroom teacher: introduce one idea at a time, connect it to an everyday example when useful, and ask a brief understanding-check question after explaining a difficult concept. Use natural conversational sentences that also sound clear when read aloud. Never claim to be a human teacher. Speak like a knowledgeable, approachable tutor: lead with the answer, use complete natural sentences, and explain calculations clearly with units and a final result. Format longer answers with short Markdown headings (##), bold key results, spaced paragraphs, and numbered steps or bullet lists when useful. Write with the polish of a leading AI assistant: well-structured, grammatical, precise and professional, never sloppy, repetitive or robotic. Keep a professional, respectful tone. Do not use decorative emojis or icon-like symbols. Always use the 12-hour clock with AM or PM for clock answers, including schedules: 1 AM through 11 AM, 12 PM for noon, 1 PM through 11 PM, and 12 AM for midnight. Never write 19pm, 23, or duplicate 24-hour formats. Omit clock seconds and unnecessary digit strings. Read quantities naturally as whole numbers, never digit by digit unless the user asks. Never include machine citation tokens containing reference IDs or line ranges; name sources naturally in prose. For simple factual questions, answer in one short sentence without an introduction, repeated facts, or a follow-up question. Give more detail when the user asks for an explanation or the task requires it. Avoid slang, filler, emoji chains, and unnecessary formatting. Avoid unnecessary brackets or parentheses around ordinary prose. Never output numeric citation markers such as [1] or [2], raw reference tokens, stray backslashes, or unexplained symbols in prose. Preserve brackets and parentheses whenever they carry meaning, including mathematical grouping, intervals, matrices, function notation, code, and requested Markdown links; never simplify them in a way that changes a calculation. Preserve meaningful mathematical notation. Preserve currency symbols exactly ($, ₱, €, etc.). Use × and ÷ for multiplication and division in readable formulas instead of ambiguous asterisks. For complex equations use LaTeX inside explicit inline delimiters \\( ... \\) or display delimiters \\[ ... \\]; never use single-dollar math delimiters because dollar signs are currency. Never send URLs, web addresses or Markdown links unless the latest user message explicitly asks for links, URLs, sources, references, or a website; links the learner did not ask for are useless to them. Otherwise explain the answer fully in your own words without links or a sources section; name a source naturally in prose if needed. When links are requested, prefer retrieved source URLs; never invent URLs or claim a link was verified unless supporting evidence is available. Match the depth to the question and avoid repetitive filler. Communicate like a natural human tutor: judge whether the message needs a one-line answer, a short explanation, or a detailed walkthrough, and default to short. Greetings and casual messages get a brief friendly reply. When you ask the user a question, ask only one at a time, then stop and wait for their reply; never answer your own questions or write both sides of the conversation. Never write placeholder lines such as \"(Waiting for your response...)\"; when you need information from the user, ask for it directly. When the user sends a photo (financial statement, receipt, chart, homework), read it carefully and explain the numbers.";
  const systemPrompt = baseSystemPrompt + (!instruction ? "\n" + CONCISE_REPLY_GUIDANCE : "") + (quizCount ? `\nPRACTICE QUIZ OVERRIDE: On the first reply show exactly ${quizCount} questions together. Follow the selected question type only. Never include URLs, sources or links. Use only the provided course text. Keep grading concise. This overrides the general one-question conversational rule and lengthy teaching guidance.` : "");
  try {
    const res = await requestAi(url, key, {
        model,
        stream: false,
        ...(!instruction && !quizCount ? (new URL(url).pathname.includes("/api/chat") ? { options: { num_predict: detailed ? 4096 : 512 } } : { max_tokens: detailed ? 4096 : 512 }) : {}),
        ...(options?.json
          ? new URL(url).pathname.includes("/api/chat")
            ? { format: "json", options: { num_predict: 16000 } }
            : { response_format: { type: "json_object" } }
          : {}),
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          ...messages,
          ...(freshness ? [{ role: "system" as const, content: freshness.instruction }] : []),
        ],
      }, Math.max(1000, Math.min(options?.timeoutMs ?? (freshness ? 40000 : 45000), 50000 - (Date.now() - startedAt))));
    if (!res.ok) {
      console.error("MFP AI error", res.status);
      return {
        ok: false as const,
        error: aiHttpError(res.status),
      };
    }
    const j = (await res.json().catch(() => ({}))) as {
      message?: { content?: string };
      choices?: { message?: { content?: string } }[];
    };
    const reply = j.message?.content ?? j.choices?.[0]?.message?.content ?? "";
    if (!reply.trim())
      return {
        ok: false,
        error: "AI returned no content. Retry or choose a different model in AI Settings.",
      };
    // Conversational answers get a second, independent checking pass while
    // time remains; any failure keeps the original draft.
    let checked = instruction || !needsChecking
      ? String(reply)
      : await verifyDraft({ url, key, model, systemPrompt, messages, freshness, draft: String(reply), startedAt });
    if (quizCount && messages.length === 1 && !hasQuizBatch(checked, quizCount) && hasQuizBatch(String(reply), quizCount)) checked = String(reply);
    if (quizCount && messages.length === 1 && !hasQuizBatch(checked, quizCount)) {
      checked = await verifyDraft({ url, key, model, systemPrompt: `${systemPrompt}\nThe draft is incomplete or incorrectly numbered. Replace it with exactly ${quizCount} questions, using headings **Question N of ${quizCount}**, numbered consecutively. No answers.`, messages, freshness: null, draft: checked, startedAt });
      if (!hasQuizBatch(checked, quizCount)) return { ok: false, error: "The AI could not generate the complete quiz. Please start again or choose fewer questions or more textbook pages." };
    }
    const shown = instruction ? checked : stripWaitingPlaceholder(checked) || stripWaitingPlaceholder(String(reply));
    // Links appear only when the latest message asks for links or sources.
    const latest = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const linkSafe = instruction || (!quizCount && wantsLinks(latest.slice(-4000))) ? shown : stripUnrequestedLinks(shown);
    if (!linkSafe.trim())
      return { ok: true as const, reply: "Which subject or lesson would you like to work on?" };
    return {
      ok: true as const,
      reply: (instruction ? linkSafe : normalizeChatTimes(stripChatCitations(linkSafe))).slice(0, instruction ? 120000 : 19000) + (freshness?.footer ?? ""),
    };
  } catch {
    return {
      ok: false,
      error:
        "The AI service timed out or could not be reached. Retry this request; saved publishing progress is preserved. If this continues, test the model in AI Settings.",
    };
  }
}

export const VERIFY_INSTRUCTION =
  "The previous assistant message is an unpublished DRAFT. Act as a strict fact-checker and math checker before it reaches the user. Check every fact, name, date, number, unit, and calculation against the supplied evidence and well-established knowledge. Recompute every calculation step by step. Correct any error. Remove or clearly qualify any claim the evidence does not support, especially event dates, results, and current values; never use today's date or the search date as the date of an event unless the evidence states it. If the question cannot be answered reliably, say what could not be verified instead of guessing. Keep the draft's language, tone, length, and formatting rules; never make it longer than needed. If the draft asks the user a question (for example a quiz question), preserve the requested number of questions, including a whole quiz batch, and never add answers or extra questions. Never replace a question with placeholder text such as \"(Waiting for your response...)\". Output ONLY the final corrected answer for the user, with no mention of the draft, the checking process, or these instructions.";

async function verifyDraft(p: {
  url: string;
  key: string;
  model: string;
  systemPrompt: string;
  messages: z.infer<typeof Msg>[];
  freshness: { instruction: string } | null;
  draft: string;
  startedAt: number;
}): Promise<string> {
  const remaining = 50000 - (Date.now() - p.startedAt);
  if (remaining < 8000) return p.draft;
  try {
    const res = await requestAi(p.url, p.key, {
        model: p.model,
        stream: false,
        messages: [
          { role: "system", content: p.systemPrompt },
          ...p.messages,
          ...(p.freshness ? [{ role: "system" as const, content: p.freshness.instruction }] : []),
          { role: "assistant", content: p.draft },
          { role: "system", content: VERIFY_INSTRUCTION },
        ],
      }, Math.min(25000, remaining));
    if (!res.ok) return p.draft;
    const j = (await res.json().catch(() => ({}))) as {
      message?: { content?: string };
      choices?: { message?: { content?: string } }[];
    };
    const checked = String(j.message?.content ?? j.choices?.[0]?.message?.content ?? "").trim();
    return checked || p.draft;
  } catch {
    return p.draft;
  }
}

function aiHttpError(status: number): string {
  if (status === 401 || status === 403)
    return "AI rejected the configured key. Update the key in AI Settings and test the connection.";
  if (status === 404)
    return "AI endpoint or model was not found. Check the URL and model in AI Settings.";
  if (status === 429) return "AI is rate limited. Wait briefly before retrying.";
  return `AI service returned HTTP ${status}. Test the connection in AI Settings before retrying.`;
}
