import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { ExternalLink } from "lucide-react";
import "katex/dist/katex.min.css";

// Keep single dollar signs literal so amounts such as $50 and $100 survive.
// Ollama also commonly emits TeX's explicit inline/display delimiters.
function normalizeMath(content: string) {
  return content.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, index) => index % 2 ? part : part
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, math: string) => `$$${math}$$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math: string) => `\n\n$$\n${math}\n$$\n\n`)).join("");
}

export function MfpMessage({ content }: { content: string }) {
  return (
    <div className="mfp-message min-w-0 max-w-full space-y-3 text-sm leading-7 [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, trust: false }]]}
        components={{
          h1: ({ children }) => <h3 className="mt-4 text-xl font-bold leading-snug text-primary first:mt-0">{children}</h3>,
          h2: ({ children }) => <h3 className="mt-4 text-lg font-bold leading-snug text-primary first:mt-0">{children}</h3>,
          h3: ({ children }) => <h4 className="mt-3 text-base font-bold leading-snug first:mt-0">{children}</h4>,
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5 marker:text-primary">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5 marker:font-bold marker:text-primary">{children}</ol>,
          strong: ({ children }) => <strong className="font-bold">{children}</strong>,
          blockquote: ({ children }) => <blockquote className="space-y-2 border-l-2 border-gold pl-3 text-muted-foreground">{children}</blockquote>,
          pre: ({ children }) => <pre className="max-w-full overflow-x-auto rounded-lg bg-background p-3 text-xs leading-6">{children}</pre>,
          code: ({ children }) => <code className="rounded bg-background px-1 py-0.5 font-mono text-[0.9em]">{children}</code>,
          table: ({ children }) => <div className="max-w-full overflow-x-auto"><table className="w-full border-collapse text-left text-xs">{children}</table></div>,
          th: ({ children }) => <th className="border border-border bg-background px-3 py-2 font-bold">{children}</th>,
          td: ({ children }) => <td className="border border-border px-3 py-2">{children}</td>,
          a: ({ href, children }) => href && /^https?:\/\//i.test(href)
            ? <a href={href} target="_blank" rel="noopener noreferrer" className="rounded-sm font-semibold text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary focus-visible:outline focus-visible:outline-2">{children}<ExternalLink aria-label="opens in a new tab" className="ml-1 inline h-3 w-3" /></a>
            : <span>{children}</span>,
          // Model-generated HTML and remote image embeds are never executed/loaded.
          img: ({ alt }) => <span>{alt}</span>,
        }}
      >{normalizeMath(content)}</ReactMarkdown>
    </div>
  );
}
