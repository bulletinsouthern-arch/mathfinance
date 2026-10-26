import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SignedImage } from "@/components/SignedImage";
import { parseBlocks, serializeBlocks, uid, type Block, type Photo } from "@/lib/blocks";

const META: Record<Block["t"], { letter: string; name: string; tone: string }> = {
  desc: { letter: "D", name: "Description box", tone: "border-l-primary bg-accent/40" },
  article: { letter: "A", name: "Article text", tone: "border-l-gold bg-background" },
  terms: { letter: "T", name: "Text block (terms)", tone: "border-l-primary/60 bg-muted/30" },
  points: { letter: "K", name: "Key points", tone: "border-l-primary/60 bg-muted/30" },
  photo: { letter: "P", name: "Photo", tone: "border-l-muted-foreground bg-muted/20" },
};

async function upload(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) { toast.error("Choose an image file"); return null; }
  const path = `lessons/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const up = await supabase.storage.from("media").upload(path, file, { contentType: file.type });
  if (up.error) { toast.error(up.error.message); return null; }
  return path;
}

function PhotoPick({ label, onPath }: { label: string; onPath: (p: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-primary bg-accent px-3 text-xs font-bold text-primary hover:bg-primary hover:text-primary-foreground">
      {busy ? "Uploading…" : label}
      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
        setBusy(true); const p = await upload(f); setBusy(false); if (p) onPath(p);
      }} />
    </label>
  );
}

function PhotoList({ photos, onChange }: { photos: Photo[]; onChange: (p: Photo[]) => void }) {
  if (!photos.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {photos.map((p, i) => (
        <div key={i} className="space-y-1 rounded-md border border-border bg-background p-2">
          <SignedImage path={p.path} alt={p.caption || "Photo"} className="h-20 w-full rounded object-cover" />
          <Input className="h-7 text-xs" placeholder="Caption" value={p.caption} onChange={(e) => onChange(photos.map((x, k) => (k === i ? { ...x, caption: e.target.value } : x)))} />
          <Button type="button" size="sm" variant="ghost" className="h-7 w-full text-destructive" onClick={() => onChange(photos.filter((_, k) => k !== i))}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>
        </div>
      ))}
    </div>
  );
}

/** The page content as separate blocks: Description, Article, Text block (terms), Key points, Photo. */
export function BlockEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [blocks, setBlocks] = useState<Block[]>(() => {
    const b = parseBlocks(value);
    return b.length ? b : [{ id: uid(), t: "article", text: "", photos: [] }];
  });
  const commit = (b: Block[]) => { setBlocks(b); onChange(serializeBlocks(b)); };
  const set = (i: number, b: Block) => commit(blocks.map((x, k) => (k === i ? b : x)));
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= blocks.length) return; const n = [...blocks]; [n[i], n[j]] = [n[j]!, n[i]!]; commit(n); };
  const make = (t: Block["t"]): Block =>
    t === "desc" ? { id: uid(), t, text: "", photos: [] }
    : t === "article" ? { id: uid(), t, text: "", photos: [] }
    : t === "terms" ? { id: uid(), t, title: "Terms", items: [{ term: "", def: "" }] }
    : t === "points" ? { id: uid(), t, title: "Key Points", items: [""] }
    : { id: uid(), t, path: "", caption: "" };
  const insertAt = (pos: number, t: Block["t"]) => { const n = [...blocks]; n.splice(pos, 0, make(t)); commit(n); };
  const add = (t: Block["t"]) => insertAt(blocks.length, t);

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Page content — blocks show in this order</p>
      <InsertBar onPick={(t) => insertAt(0, t)} label="Insert at top" />
      {blocks.map((b, i) => {
        const m = META[b.t];
        return (
          <div key={b.id} className={`rounded-lg border border-border border-l-4 p-3 ${m.tone}`}>
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{m.letter}</span>
              <span className="text-sm font-bold">{m.name}</span>
              <div className="ml-auto flex gap-1">
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => confirm("Delete this block?") && commit(blocks.filter((_, k) => k !== i))} aria-label="Delete block"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>

            {(b.t === "desc" || b.t === "article") && (
              <div className="space-y-2">
                <Textarea className={b.t === "article" ? "min-h-48 text-sm" : "min-h-20 text-sm"} value={b.text}
                  placeholder={b.t === "desc" ? "Short description shown in the green box, e.g. Read this section to learn about…" : "Write the article. Blank line = new paragraph · **bold** · ## Sub-heading · - bullet"}
                  onChange={(e) => set(i, { ...b, text: e.target.value })} />
                <PhotoList photos={b.photos} onChange={(photos) => set(i, { ...b, photos })} />
                <PhotoPick label="+ Photo in this block" onPath={(path) => set(i, { ...b, photos: [...b.photos, { path, caption: "" }] })} />
              </div>
            )}

            {b.t === "terms" && (
              <div className="space-y-2">
                <Input className="font-bold" value={b.title} placeholder="Block title, e.g. Terms, Stakeholders, Stockholders" onChange={(e) => set(i, { ...b, title: e.target.value })} />
                {b.items.map((it, k) => (
                  <div key={k} className="grid gap-2 rounded-md border border-border bg-background p-2 sm:grid-cols-[180px_1fr_auto]">
                    <Input placeholder="Word, e.g. Stakeholder" value={it.term} onChange={(e) => set(i, { ...b, items: b.items.map((x, j) => (j === k ? { ...x, term: e.target.value } : x)) })} />
                    <Textarea className="min-h-10 text-sm" placeholder="Meaning" value={it.def} onChange={(e) => set(i, { ...b, items: b.items.map((x, j) => (j === k ? { ...x, def: e.target.value } : x)) })} />
                    <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => set(i, { ...b, items: b.items.filter((_, j) => j !== k) })}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={() => set(i, { ...b, items: [...b.items, { term: "", def: "" }] })}><Plus className="mr-1 h-3.5 w-3.5" />Add word</Button>
              </div>
            )}

            {b.t === "points" && (
              <div className="space-y-2">
                <Input className="font-bold" value={b.title} onChange={(e) => set(i, { ...b, title: e.target.value })} />
                {b.items.map((it, k) => (
                  <div key={k} className="flex gap-2">
                    <Input placeholder="Point" value={it} onChange={(e) => set(i, { ...b, items: b.items.map((x, j) => (j === k ? e.target.value : x)) })} />
                    <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => set(i, { ...b, items: b.items.filter((_, j) => j !== k) })}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={() => set(i, { ...b, items: [...b.items, ""] })}><Plus className="mr-1 h-3.5 w-3.5" />Add point</Button>
              </div>
            )}

            {b.t === "photo" && (
              <div className="space-y-2">
                {b.path ? <SignedImage path={b.path} alt={b.caption || "Photo"} className="max-h-40 rounded object-contain" /> : <PhotoPick label="+ Upload photo" onPath={(path) => set(i, { ...b, path })} />}
                <Input placeholder="Caption" value={b.caption} onChange={(e) => set(i, { ...b, caption: e.target.value })} />
              </div>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-dashed border-primary/50 p-2">
        <span className="self-center px-1 text-xs font-bold text-primary">Add block:</span>
        {(["desc", "article", "terms", "points", "photo"] as const).map((t) => (
          <Button key={t} type="button" size="sm" variant="outline" onClick={() => add(t)}><Plus className="mr-1 h-3.5 w-3.5" />{META[t].letter} · {META[t].name}</Button>
        ))}
      </div>
    </div>
  );
}
