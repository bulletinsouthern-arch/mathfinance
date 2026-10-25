import { Fragment, type ReactNode } from "react";
import { SignedImage } from "@/components/SignedImage";

/**
 * Renders simple lesson formatting written in the admin course builder:
 *  # Heading   ## Sub-heading   - bullet   > highlighted note
 *  ![caption](image-link)   **bold**   blank line = new paragraph
 */
function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
}

const PLACEHOLDER = /The admin can replace this text with the full article in the course builder\.?/g;

export function cleanContent(text: string) {
  return text.replace(/\r/g, "").replace(PLACEHOLDER, "");
}

/** Plain readable text for the "Listen" button. */
export function speakableText(text: string) {
  return cleanContent(text)
    .split("\n")
    .filter((l) => !/^!\[/.test(l.trim()))
    .map((l) => l.replace(/^(#{1,2}|>|-|•)\s*/, "").replace(/\*\*/g, ""))
    .join(". ")
    .replace(/(\.\s*){2,}/g, ". ");
}

const isSectionTitle = (l: string) => /^(section|unit|chapter)\s+\d+[:.]/i.test(l);
// A short line with no ending punctuation reads as a heading (works for plain pasted articles).
const isAutoHeading = (l: string) => l.length <= 60 && !/[.,;:?!"”)]$/.test(l) && !/^[-•>!#]/.test(l) && /^[A-Z]/.test(l);

export function RichContent({ text }: { text: string }) {
  const lines = cleanContent(text).split("\n").map((l) => l.trim());
  const out: ReactNode[] = [];
  let list: string[] = [];
  let mode: "none" | "points" | "terms" = "none";
  let pendingTerm: string | null = null;
  let introNext = false;
  const flushList = () => {
    if (list.length) out.push(<ul key={`u${out.length}`} className="my-4 space-y-2.5 pl-1">{list.map((l, i) => <li key={i} className="flex gap-3"><span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span>{inline(l)}</span></li>)}</ul>);
    list = [];
  };
  const h = (cls: string, t: string) => out.push(<h3 key={`h${out.length}`} className={cls}>{inline(t)}</h3>);
  for (const line of lines) {
    if (!line) continue;
    const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (line.startsWith("- ") || line.startsWith("• ")) { list.push(line.slice(2)); continue; }
    if (img) {
      flushList();
      const path = img[2]!.replace(/^media:/, "");
      out.push(
        <figure key={`f${out.length}`} className="mx-auto my-6 w-fit max-w-full rounded-xl border border-border bg-muted/30 p-3 text-center">
          <SignedImage path={path} alt={img[1] || "Lesson figure"} className="mx-auto h-auto max-h-[280px] w-auto max-w-[min(100%,420px)] rounded-lg object-contain" />
          {img[1] && <figcaption className="mt-3 text-sm italic text-muted-foreground">{img[1]}</figcaption>}
        </figure>,
      );
      continue;
    }
    const heading = line.startsWith("# ") ? line.slice(2) : isSectionTitle(line) ? line : null;
    if (heading !== null) {
      flushList(); mode = "none";
      out.push(<h2 key={`s${out.length}`} className="mt-10 font-sans text-3xl font-bold tracking-tight text-foreground first:mt-0 md:text-[2.1rem]">{inline(heading)}</h2>);
      introNext = true; continue;
    }
    if (introNext && /^(#|-|•|!\[)/.test(line)) introNext = false;
    if (line.startsWith("> ") || introNext) {
      flushList(); introNext = false;
      out.push(<blockquote key={`q${out.length}`} className="my-5 rounded-r-lg border-l-[5px] border-primary bg-accent/60 px-6 py-5 text-[15.5px] leading-7 text-foreground">{inline(line.replace(/^>\s*/, ""))}</blockquote>);
      continue;
    }
    const sub = line.startsWith("## ") ? line.slice(3) : null;
    const known = /^(key points?|terms|key terms|glossary|examples?|summary|overview)$/i.test(line);
    if (mode === "terms" && sub === null && !known && pendingTerm === null && line.length <= 60 && !/[.;?!]$/.test(line)) { pendingTerm = line; continue; }
    if (sub !== null || known || isAutoHeading(line)) {
      const t = sub ?? line;
      flushList();
      mode = /^key points?$/i.test(t) ? "points" : /^(terms|key terms|glossary)$/i.test(t) ? "terms" : "none";
      h(mode === "none" ? "mt-8 font-sans text-xl font-bold text-foreground" : "mt-8 border-b border-border pb-2 font-sans text-sm font-bold uppercase tracking-[0.15em] text-primary", t);
      continue;
    }
    if (mode === "points") { list.push(line); continue; }
    if (mode === "terms" && pendingTerm) {
      out.push(<div key={`t${out.length}`} className="my-3 rounded-lg border border-border bg-muted/40 px-5 py-3"><p className="font-bold text-foreground">{pendingTerm}</p><p className="mt-1 text-foreground/85">{inline(line)}</p></div>);
      pendingTerm = null; continue;
    }
    flushList();
    out.push(<p key={`p${out.length}`} className="my-4">{inline(line)}</p>);
  }
  flushList();
  return <div className="text-[15.5px] leading-7 text-foreground/90">{out}</div>;
}
