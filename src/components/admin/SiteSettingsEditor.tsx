import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bot,
  CheckCircle2,
  CreditCard,
  Image as ImageIcon,
  ShieldCheck,
  Sparkles,
  Type,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  saveSiteSetting,
  useSiteSettings,
  resolveAiEndpoint,
  resolveAiModel,
  resolveVisionModel,
} from "@/lib/settings";
import { getAiKeyStatus, testAiConnection } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CATEGORIES } from "@/lib/formulas";
import { CatLogo } from "@/components/SignedImage";

const TEXT_FIELDS: { key: string; label: string; hint?: string; type?: string }[] = [
  { key: "site_name", label: "Website name", hint: "Default: Math & Finance Pro" },
  {
    key: "site_tagline",
    label: "Website tagline",
    hint: "Default: REAL NUMBERS. BETTER DECISIONS.",
  },
  { key: "courses_hero_title", label: "Courses page headline" },
  {
    key: "courses_hero_sub",
    label: "Course banner description",
    hint: 'Replace “100% Online · Self-Paced · Tuition Free · Enroll Anytime” with your own access or pricing text.',
  },
  {
    key: "stat_students_label",
    label: "Stat 1 label",
    hint: "Value is the real enrolled-student count",
  },
  { key: "stat_courses_label", label: "Stat 2 label", hint: "Value is the real free-course count" },
  { key: "stat_subjects_label", label: "Stat 3 label", hint: "Value is the real subject count" },
  {
    key: "stat_free_value",
    label: "Learning statistic — percentage or value",
    hint: 'Default: 100%. Enter your own value, including the % sign, e.g. “75%”, or text such as “Members only”.',
  },
  {
    key: "stat_free_label",
    label: "Learning statistic — label (Free to Learn)",
    hint: 'Default: Free to Learn. Use your own text, e.g. “Private Learning” or “Paid Membership”.',
  },
  { key: "free_trial_days", label: "Free trial length (days)" },
  { key: "course_price", label: "Default course price (₱)" },
];

export function SiteSettingsEditor() {
  const s = useSiteSettings();
  const qc = useQueryClient();
  const fetchAiStatus = useServerFn(getAiKeyStatus);
  const testAi = useServerFn(testAiConnection);

  const [vals, setVals] = useState<Record<string, string>>({});
  const [aiUrl, setAiUrl] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [visionModel, setVisionModel] = useState(resolveVisionModel());
  const [aiKey, setAiKey] = useState("");
  const [aiStatus, setAiStatus] = useState<{
    configured: boolean;
    source: string;
    masked: string;
  } | null>(null);
  const [mfpUrl, setMfpUrl] = useState("");
  const [mfpOn, setMfpOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [testingAi, setTestingAi] = useState(false);

  useEffect(() => {
    fetchAiStatus()
      .then(setAiStatus)
      .catch(() => {});
  }, [fetchAiStatus]);

  useEffect(() => {
    if (!Object.keys(s).length) return;
    const initial: Record<string, string> = {};
    for (const f of TEXT_FIELDS) {
      initial[f.key] = s[f.key] ?? "";
    }
    setVals((v) => ({ ...initial, ...v }));
    setAiUrl(resolveAiEndpoint(s["ai_url"]));
    setAiModel(resolveAiModel(s["ai_model"]));
    setVisionModel(resolveVisionModel(s["ai_vision_model"]));
    setMfpUrl(s["mfp_url"] ?? "");
    setMfpOn(s["mfp_enabled"] !== "false");
  }, [s]);

  async function saveAll() {
    setBusy(true);
    for (const f of TEXT_FIELDS) {
      const v = vals[f.key] ?? "";
      const { error } = await saveSiteSetting(f.key, v);
      if (error) {
        setBusy(false);
        return void toast.error(error.message);
      }
    }
    await saveSiteSetting("mfp_url", mfpUrl);
    await saveSiteSetting("mfp_enabled", mfpOn ? "true" : "false");
    setBusy(false);
    toast.success("Site text saved");
    qc.invalidateQueries({ queryKey: ["site-settings"] });
  }

  async function saveAiSettings() {
    setBusy(true);
    const cleanUrl = resolveAiEndpoint(aiUrl);
    const cleanModel = resolveAiModel(aiModel);
    let err = (await saveSiteSetting("ai_url", cleanUrl)).error;
    if (err) {
      setBusy(false);
      return void toast.error(err.message);
    }
    err = (await saveSiteSetting("ai_model", cleanModel)).error;
    if (err) {
      setBusy(false);
      return void toast.error(err.message);
    }

    err = (await saveSiteSetting("ai_vision_model", resolveVisionModel(visionModel))).error;
    if (err) {
      setBusy(false);
      return void toast.error(err.message);
    }

    if (aiKey.trim()) {
      err = (await saveSiteSetting("ai_key", aiKey.trim())).error;
      if (err) {
        setBusy(false);
        return void toast.error(err.message);
      }
      setAiKey("");
    }

    setAiUrl(cleanUrl);
    setAiModel(cleanModel);
    setBusy(false);
    toast.success("AI settings saved");
    qc.invalidateQueries({ queryKey: ["site-settings"] });
    fetchAiStatus()
      .then(setAiStatus)
      .catch(() => {});
  }

  async function handleTestAi() {
    setTestingAi(true);
    try {
      const res = await testAi({ data: { candidateKey: aiKey.trim() || undefined } });
      if (res && typeof res === "object" && "ok" in res && res.ok) {
        toast.success(`AI Connection Successful! Model "${res.model}" is active and responding.`);
      } else {
        const err =
          res && typeof res === "object" && "error" in res
            ? String(res.error)
            : "AI connection failed.";
        toast.error(err);
      }
    } catch (e: unknown) {
      toast.error((e as Error)?.message || "Failed to reach AI service");
    } finally {
      setTestingAi(false);
    }
  }

  const [cat, setCat] = useState(1);
  async function uploadCatLogo(file: File) {
    if (!file.type.startsWith("image/")) return void toast.error("Choose an image file");
    const path = `logos/cat-${cat}-${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from("media").upload(path, file, { contentType: file.type });
    if (up.error) return void toast.error(up.error.message);
    const { error } = await saveSiteSetting(`cat_logo_${cat}`, path);
    if (error) return void toast.error(error.message);
    toast.success("Category logo updated");
    qc.invalidateQueries({ queryKey: ["site-settings"] });
  }
  async function resetCatLogo() {
    await saveSiteSetting(`cat_logo_${cat}`, "");
    toast.success("Default icon restored");
    qc.invalidateQueries({ queryKey: ["site-settings"] });
  }

  async function uploadLogo(file: File) {
    if (!file.type.startsWith("image/")) return void toast.error("Choose an image file");
    const path = `logos/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from("media").upload(path, file, { contentType: file.type });
    if (up.error) return void toast.error(up.error.message);
    const { error } = await saveSiteSetting("site_logo", path);
    if (error) return void toast.error(error.message);
    toast.success("Logo updated");
    qc.invalidateQueries({ queryKey: ["site-settings"] });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-6">
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <h3 className="flex items-center gap-2 text-xl font-semibold">
            <Type className="h-5 w-5 text-primary" />
            Site text &amp; numbers
          </h3>
          <p className="text-sm text-muted-foreground">
            Customize the banner and statistics on the home and courses pages, including
            “Free to Learn” and its percentage. Save all text to publish your changes.
            These labels describe your offering; course prices and access are managed in the course settings.
          </p>
          {TEXT_FIELDS.map((f) => (
            <div key={f.key}>
              <Label htmlFor={`site-text-${f.key}`}>{f.label}</Label>
              <Input
                id={`site-text-${f.key}`}
                type={f.type || "text"}
                className="mt-1"
                value={vals[f.key] ?? ""}
                onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
              />
              {f.hint && <p className="mt-1 text-xs text-muted-foreground">{f.hint}</p>}
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={saveAll} disabled={busy}>
              {busy ? "Saving…" : "Save all text"}
            </Button>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-xl font-semibold">
              <Bot className="h-5 w-5 text-primary" />
              MFP AI Assistant &amp; API Key
            </h3>
            {aiStatus && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${aiStatus.configured ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}
              >
                {aiStatus.configured ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Active ({aiStatus.masked || "Configured"})
                  </>
                ) : (
                  "Not configured"
                )}
              </span>
            )}
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Confidential &amp; Secure
            </div>
            <p className="mt-1">
              Your AI API key is kept server-side and never exposed to website visitors, students,
              or browser bundles.
            </p>
          </div>

          <div>
            <Label>MFP AI endpoint URL</Label>
            <Input
              className="mt-1 font-mono text-sm"
              value={aiUrl}
              onChange={(e) => setAiUrl(e.target.value)}
              placeholder="https://ollama.com/api/chat"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Default: https://ollama.com/api/chat. Web portal URLs (chatgpt.com) are automatically
              normalized.
            </p>
          </div>

          <div>
            <Label>MFP AI model</Label>
            <Input
              className="mt-1 font-mono text-sm"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              placeholder="gpt-oss:120b"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Default: gpt-oss:120b (supported: llama3.3, mistral, etc.)
            </p>
          </div>

          <div>
            <Label htmlFor="exam-vision-model">Exam camera model (Ollama vision)</Label>
            <Input
              id="exam-vision-model"
              className="mt-1 font-mono text-sm"
              value={visionModel}
              onChange={(e) => setVisionModel(e.target.value)}
              placeholder={resolveVisionModel()}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Uses the same Ollama endpoint and server-side key. Choose an image-capable model
              available on your endpoint. No person visible triggers an orange warning;
              continued confirmed absence or hidden eyes for 30 seconds suspends the attempt. MFP chat uses its own model above.
            </p>
          </div>

          <div>
            <Label>MFP AI API key</Label>
            <Input
              type="password"
              className="mt-1 font-mono text-sm"
              value={aiKey}
              onChange={(e) => setAiKey(e.target.value)}
              placeholder={
                aiStatus?.configured
                  ? "•••••••••••• (Enter new key to update)"
                  : "Paste your Ollama API key"
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {aiStatus?.configured
                ? `Currently configured via ${aiStatus.source}.`
                : "You can enter your key here or set OLLAMA_API_KEY in Netlify."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={saveAiSettings} disabled={busy}>
              {busy ? "Saving…" : "Save AI settings"}
            </Button>
            <Button type="button" variant="secondary" disabled={testingAi} onClick={handleTestAi}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              {testingAi ? "Testing connection…" : "Test AI connection"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setAiUrl("https://ollama.com/api/chat");
                setAiModel("gpt-oss:120b");
              }}
            >
              Reset AI defaults
            </Button>
          </div>
        </section>
      </div>

      <div className="space-y-6">
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <h3 className="flex items-center gap-2 text-xl font-semibold">
            <ImageIcon className="h-5 w-5 text-primary" />
            Site logo
          </h3>
          <p className="text-xs text-muted-foreground">
            Upload your own logo — it replaces the default icon in the header.
          </p>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-6 text-sm text-muted-foreground hover:border-primary">
            <ImageIcon className="h-6 w-6" />
            Click to upload a logo image
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
            />
          </label>
          {s["site_logo"] && <p className="text-xs text-primary">A custom logo is active.</p>}
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <h3 className="flex items-center gap-2 text-xl font-semibold">
            <ImageIcon className="h-5 w-5 text-primary" />
            Formula category logos
          </h3>
          <p className="text-xs text-muted-foreground">
            Pick a category, then upload your own logo for it. It shows on the home page and formula
            lists.
          </p>
          <select
            value={cat}
            onChange={(e) => setCat(Number(e.target.value))}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id}. {c.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CatLogo cat={cat} className="h-6 w-6" />
            </span>
            <label className="cursor-pointer rounded-md border border-border px-4 py-2 text-sm font-semibold hover:border-primary">
              Upload logo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadCatLogo(e.target.files[0])}
              />
            </label>
            {s[`cat_logo_${cat}`] && (
              <Button variant="ghost" size="sm" onClick={resetCatLogo}>
                Use default
              </Button>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <h3 className="flex items-center gap-2 text-xl font-semibold">
            <CreditCard className="h-5 w-5 text-primary" />
            MFP assistant button
          </h3>
          <div className="flex items-center gap-2">
            <Switch checked={mfpOn} onCheckedChange={setMfpOn} />
            <Label>Show the floating MFP button</Label>
          </div>
          <div>
            <Label>Assistant link</Label>
            <Input
              className="mt-1"
              value={mfpUrl}
              onChange={(e) => setMfpUrl(e.target.value)}
              placeholder="https://…"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Opens in the small floating panel when visitors click MFP.
            </p>
          </div>
          <Button onClick={saveAll} disabled={busy}>
            Save assistant settings
          </Button>
        </section>
      </div>
    </div>
  );
}
