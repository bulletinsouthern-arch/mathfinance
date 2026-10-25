import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMedia, type MediaPost } from "@/lib/media";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Us & Gallery — Math & Finance Pro" },
      { name: "description", content: "Who we are, what we stand for, and our photo and video gallery." },
      { property: "og:title", content: "About Math & Finance Pro" },
      { property: "og:description", content: "Who we are and our photo and video gallery." },
    ],
  }),
  component: About,
});

function About() {
  const { data: about } = useQuery({
    queryKey: ["content", "about"],
    queryFn: async () => (await supabase.from("site_content").select("title, body").eq("key", "about").maybeSingle()).data,
  });
  const { data: media = [], isLoading } = useQuery({ queryKey: ["media", "gallery"], queryFn: () => fetchMedia(true) });
  const [open, setOpen] = useState<MediaPost | null>(null);

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_1.2fr]">
      <section className="h-fit rounded-2xl border border-border bg-card p-8 xl:sticky xl:top-24">
        <p className="text-xs font-semibold tracking-[0.2em] text-primary">ABOUT US</p>
        <h1 className="mt-2 text-4xl font-semibold leading-tight">{about?.title ?? "About us"}</h1>
        <span className="mt-4 block h-0.5 w-16 bg-gold" />
        <div className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-foreground/85">{about?.body}</div>
      </section>

      <section>
        <p className="text-xs font-semibold tracking-[0.2em] text-primary">GALLERY</p>
        <h2 className="mt-1 text-3xl font-semibold">Photos &amp; Videos</h2>
        {isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
        ) : media.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">No photos or videos yet.</div>
        ) : (
          <div className="mt-6 columns-1 gap-4 sm:columns-2 [&>*]:mb-4">
            {media.map((m) => (
              <figure key={m.id} className="break-inside-avoid overflow-hidden rounded-xl border border-border bg-card">
                {m.media_type === "video" ? (
                  <video src={m.url} controls playsInline preload="metadata" className="block w-full bg-muted" />
                ) : (
                  <button className="block w-full" onClick={() => setOpen(m)}>
                    <img src={m.url} alt={m.title || "Gallery photo"} loading="lazy" className="block h-auto w-full" />
                  </button>
                )}
                {(m.title || m.caption) && (
                  <figcaption className="p-4">
                    {m.title && <p className="font-medium">{m.title}</p>}
                    {m.caption && <p className="mt-1 text-sm text-muted-foreground">{m.caption}</p>}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        )}
      </section>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/80 p-6" onClick={() => setOpen(null)}>
          <button className="absolute right-6 top-6 text-background" aria-label="Close"><X className="h-6 w-6" /></button>
          <img src={open.url} alt={open.title} className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}
