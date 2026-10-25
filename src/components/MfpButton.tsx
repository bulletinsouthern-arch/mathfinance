import { useState } from "react";
import { ExternalLink, Sparkles, X } from "lucide-react";
import { useSiteSettings } from "@/lib/settings";

// Floating MFP assistant: a small round button that opens a compact panel.
export function MfpButton() {
  const s = useSiteSettings();
  const [open, setOpen] = useState(false);
  if (s.mfp_enabled !== "true" || !s.mfp_url) return null;

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 z-50 flex h-[520px] w-[92vw] max-w-[400px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-elegant)] sm:right-6">
          <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
            <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4" />MFP Assistant</p>
            <div className="flex items-center gap-1">
              <a href={s.mfp_url} target="_blank" rel="noreferrer" aria-label="Open in new window" className="rounded-md p-1.5 hover:bg-primary-foreground/15">
                <ExternalLink className="h-4 w-4" />
              </a>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1.5 hover:bg-primary-foreground/15">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <iframe src={s.mfp_url} title="MFP Assistant" className="h-full w-full flex-1 bg-background" />
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        aria-label="Open MFP assistant"
        className="fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary font-serif text-sm font-bold tracking-wide text-primary-foreground shadow-[var(--shadow-elegant)] transition hover:scale-105 sm:right-6"
      >
        {open ? <X className="h-5 w-5" /> : "MFP"}
      </button>
    </>
  );
}
