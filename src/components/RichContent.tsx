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

export function RichContent({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flushList = () => {
    if (list.length) out.push(<ul key={`u${out.length}`} className="my-3 list-disc space-y-1.5 pl-6">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  const flushPara = () => {
    if (para.length) out.push(<p key={`p${out.length}`} className="my-3">{inline(para.join(" "))}</p>);
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (!line) { flushList(); flushPara(); continue; }
    if (line.startsWith("- ") || line.startsWith("• ")) { flushPara(); list.push(line.slice(2)); continue; }
    flushList();
    if (img) {
      flushPara();
      const path = img[2]!.replace(/^media:/, "");
      out.push(
        <figure key={`f${out.length}`} className="my-6 text-center">
          <SignedImage path={path} alt={img[1] || "Lesson figure"} className="mx-auto h-auto max-h-[480px] w-auto max-w-full rounded-lg" />
          {img[1] && <figcaption className="mt-2 text-sm italic text-muted-foreground">{img[1]}</figcaption>}
        </figure>,
      );
    } else if (line.startsWith("## ")) { flushPara(); out.push(<h4 key={`h${out.length}`} className="mt-6 font-sans text-lg font-bold">{inline(line.slice(3))}</h4>); }
    else if (line.startsWith("# ")) { flushPara(); out.push(<h3 key={`h${out.length}`} className="mt-8 font-sans text-xl font-bold">{inline(line.slice(2))}</h3>); }
    else if (line.startsWith("> ")) { flushPara(); out.push(<blockquote key={`q${out.length}`} className="my-4 border-l-4 border-primary bg-accent/60 px-5 py-3">{inline(line.slice(2))}</blockquote>); }
    else para.push(line);
  }
  flushList(); flushPara();
  return <div className="text-[15px] leading-relaxed text-foreground/90">{out}</div>;
}
