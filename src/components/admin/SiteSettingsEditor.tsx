import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Image as ImageIcon, Type } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { saveSiteSetting, useSiteSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const TEXT_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: "courses_hero_title", label: "Courses page headline" },
  { key: "courses_hero_sub", label: "Courses page sub-headline" },
  { key: "stat_students_label", label: "Stat 1 label", hint: "Value is the real enrolled-student count" },
  { key: "stat_courses_label", label: "Stat 2 label", hint: "Value is the real free-course count" },
  { key: "stat_subjects_label", label: "Stat 3 label", hint: "Value is the real subject count" },
  { key: "stat_free_value", label: "Stat 4 value", hint: 'Any text, e.g. "100%" or "30 days only"' },
  { key: "stat_free_label", label: "Stat 4 label" },
  { key: "free_trial_days", label: "Free trial length (days)" },
  { key: "course_price", label: "Default course price (₱)" },
];

export function SiteSettingsEditor() {
  const s = useSiteSettings();
  const qc = useQueryClient();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [mfpUrl, setMfpUrl] = useState("");
  const [mfpOn, setMfpOn] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!Object.keys(s).length) return;
    setVals((v) => ({ ...Object.fromEntries(TEXT_FIELDS.map((f) => [f.key, s[f.key] ?? ""])), ...v }));
    setMfpUrl(s["mfp_url"] ?? "");
    setMfpOn(s["mfp_enabled"] !== "false");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  async function saveAll() {
    setBusy(true);
    for (const f of TEXT_FIELDS) {
      const { error } = await saveSiteSetting(f.key, vals[f.key] ?? "");
      if (error) { setBusy(false); return void toast.error(error.message); }
    }
    await saveSiteSetting("mfp_url", mfpUrl);
    await saveSiteSetting("mfp_enabled", mfpOn ? "true" : "false");
    setBusy(false);
    toast.success("Site text saved");
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
      <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <h3 className="flex items-center gap-2 text-xl font-semibold"><Type className="h-5 w-5 text-primary" />Site text &amp; numbers</h3>
        {TEXT_FIELDS.map((f) => (
          <div key={f.key}>
            <Label>{f.label}</Label>
            <Input className="mt-1" value={vals[f.key] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} />
            {f.hint && <p className="mt-1 text-xs text-muted-foreground">{f.hint}</p>}
          </div>
        ))}
        <Button onClick={saveAll} disabled={busy}>{busy ? "Saving…" : "Save all text"}</Button>
      </section>

      <div className="space-y-6">
        <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <h3 className="flex items-center gap-2 text-xl font-semibold"><ImageIcon className="h-5 w-5 text-primary" />Site logo</h3>
          <p className="text-xs text-muted-foreground">Upload your own logo — it replaces the default icon in the header.</p>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-6 text-sm text-muted-foreground hover:border-primary">
            <ImageIcon className="h-6 w-6" />
            Click to upload a logo image
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
          </label>
          {s["site_logo"] && <p className="text-xs text-primary">A custom logo is active.</p>}
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <h3 className="flex items-center gap-2 text-xl font-semibold"><CreditCard className="h-5 w-5 text-primary" />MFP assistant button</h3>
          <div className="flex items-center gap-2"><Switch checked={mfpOn} onCheckedChange={setMfpOn} /><Label>Show the floating MFP button</Label></div>
          <div>
            <Label>Assistant link</Label>
            <Input className="mt-1" value={mfpUrl} onChange={(e) => setMfpUrl(e.target.value)} placeholder="https://…" />
            <p className="mt-1 text-xs text-muted-foreground">Opens in the small floating panel when visitors click MFP.</p>
          </div>
          <Button onClick={saveAll} disabled={busy}>Save assistant settings</Button>
        </section>
      </div>
    </div>
  );
}
