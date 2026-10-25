import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen, ClipboardList, CreditCard, FileText, Image as ImageIcon, LayoutDashboard, Shield, Trash2, Type, Upload, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchMedia } from "@/lib/media";
import { FORMULAS, CATEGORIES } from "@/lib/formulas";
import { CourseBuilder } from "@/components/admin/CourseBuilder";
import { QuizBuilder } from "@/components/admin/QuizBuilder";
import { SiteSettingsEditor } from "@/components/admin/SiteSettingsEditor";
import { FormulaGuideEditor } from "@/components/admin/FormulaGuideEditor";
import { PaymentSettings } from "@/components/admin/PaymentSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — Math & Finance Pro" },
      { name: "description", content: "Manage site content, courses, quizzes, payments and the photo & video gallery." },
      { property: "og:title", content: "Admin Dashboard" },
      { property: "og:description", content: "Site administration." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

const TABS = [
  { id: "content", label: "Site content", icon: FileText },
  { id: "media", label: "Photos & videos", icon: ImageIcon },
  { id: "courses", label: "Course builder", icon: BookOpen },
  { id: "quizzes", label: "Quizzes", icon: ClipboardList },
  { id: "text", label: "Text & logo", icon: Type },
  { id: "formulas", label: "Formula descriptions", icon: FileText },
  { id: "payments", label: "Payments", icon: CreditCard },
] as const;

type TabId = (typeof TABS)[number]["id"];

function Admin() {
  const { isAdmin, loading, username } = useAuth();
  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!isAdmin)
    return (
      <div className="mx-auto mt-20 max-w-md text-center">
        <Shield className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-3xl font-semibold">Admins only</h1>
        <p className="mt-2 text-sm text-muted-foreground">This area is reserved for the site administrator.</p>
        <Button asChild className="mt-6"><Link to="/">Go home</Link></Button>
      </div>
    );
  return <Dashboard username={username!} />;
}

function Dashboard({ username }: { username: string }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabId>("content");
  const { data: media = [] } = useQuery({ queryKey: ["media", "all"], queryFn: () => fetchMedia(false) });
  const photos = media.filter((m) => m.media_type === "image").length;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-primary p-8 text-primary-foreground shadow-[var(--shadow-elegant)]">
        <div>
          <p className="flex items-center gap-2 text-xs tracking-[0.2em] opacity-80"><LayoutDashboard className="h-4 w-4" />ADMIN DASHBOARD</p>
          <h1 className="mt-2 text-4xl font-semibold">Welcome, {username}</h1>
          <p className="mt-1 text-sm opacity-80">Edit your site's text, build courses and quizzes, and publish photos and videos.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          {[["Formulas", FORMULAS.length], ["Categories", CATEGORIES.length], ["Photos", photos], ["Videos", media.length - photos]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-primary-foreground/10 px-4 py-3"><p className="font-serif text-2xl">{v}</p><p className="text-[11px] opacity-80">{k}</p></div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${tab === t.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary"}`}>
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === "content" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <ContentEditor k="about" label="About Us" />
          <ContentEditor k="hero" label="Home page banner" />
        </div>
      )}
      {tab === "media" && (
        <>
          <Uploader onDone={() => qc.invalidateQueries({ queryKey: ["media"] })} />
          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-2xl font-semibold">Published media ({media.length})</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {media.map((m) => (
                <div key={m.id} className="overflow-hidden rounded-xl border border-border">
                  {m.media_type === "video" ? <video src={m.url} controls preload="metadata" className="aspect-video w-full bg-muted object-contain" /> : <img src={m.url} alt={m.title} className="aspect-video w-full bg-muted object-contain" />}
                  <div className="flex items-start justify-between gap-2 p-3">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{m.title || "Untitled"}</p><p className="text-xs text-muted-foreground">{m.show_in_gallery ? "In gallery" : "Hidden"}</p></div>
                    <Button size="icon" variant="ghost" aria-label="Delete" onClick={async () => {
                      if (!confirm("Delete this item?")) return;
                      await supabase.storage.from("media").remove([m.media_url]);
                      const { error } = await supabase.from("media_posts").delete().eq("id", m.id);
                      if (error) toast.error(error.message); else { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["media"] }); }
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      {tab === "courses" && <CourseBuilder />}
      {tab === "quizzes" && <QuizBuilder />}
      {tab === "text" && <SiteSettingsEditor />}
      {tab === "formulas" && <FormulaGuideEditor />}
      {tab === "payments" && <PaymentSettings />}
    </div>
  );
}

function ContentEditor({ k, label }: { k: string; label: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["content", k], queryFn: async () => (await supabase.from("site_content").select("title, body").eq("key", k).maybeSingle()).data });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  useEffect(() => { if (data) { setTitle(data.title); setBody(data.body); } }, [data]);
  async function save() {
    const { error } = await supabase.from("site_content").upsert({ key: k, title, body, updated_at: new Date().toISOString() });
    if (error) return void toast.error(error.message);
    toast.success(`${label} saved`);
    qc.invalidateQueries({ queryKey: ["content", k] });
  }
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <h2 className="flex items-center gap-2 text-2xl font-semibold"><FileText className="h-5 w-5 text-primary" />{label}</h2>
      <div><Label>Heading</Label><Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div><Label>Text</Label><Textarea className="mt-1 min-h-48" value={body} onChange={(e) => setBody(e.target.value)} /></div>
      <Button onClick={save}>Save changes</Button>
    </section>
  );
}

function Uploader({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [gallery, setGallery] = useState(true);
  const [busy, setBusy] = useState(false);
  async function upload() {
    if (!file) return void toast.error("Choose a photo or video");
    const type = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
    if (!type) return void toast.error("Only photos and videos are supported");
    if (file.size > 50 * 1024 * 1024) return void toast.error("Max file size is 50 MB");
    setBusy(true);
    const path = `${type}s/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from("media").upload(path, file, { contentType: file.type });
    if (up.error) { setBusy(false); return void toast.error(up.error.message); }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("media_posts").insert({ title, caption, media_url: path, media_type: type, show_in_gallery: gallery, created_by: u.user?.id ?? null });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success("Published");
    setFile(null); setTitle(""); setCaption("");
    onDone();
  }
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <h2 className="flex items-center gap-2 text-2xl font-semibold"><Upload className="h-5 w-5 text-primary" />Post a photo or video</h2>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-sm text-muted-foreground hover:border-primary">
        <span className="flex gap-2"><ImageIcon className="h-6 w-6" /><Video className="h-6 w-6" /></span>
        {file ? file.name : "Click to choose a photo or video (max 50 MB)"}
        <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <div><Label>Title</Label><Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><Label>Caption</Label><Input className="mt-1" value={caption} onChange={(e) => setCaption(e.target.value)} /></div>
      </div>
      <div className="flex items-center gap-2"><Switch checked={gallery} onCheckedChange={setGallery} /><Label>Show in About Us gallery</Label></div>
      <Button onClick={upload} disabled={busy}>{busy ? "Uploading…" : "Publish"}</Button>
    </section>
  );
}
