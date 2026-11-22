import { ExternalLink } from "lucide-react";
import { courseEmbedUrl, safeCourseUrl } from "@/lib/course-presentation";

export function CourseEmbed({ url, title }: { url: string; title: string }) {
  const src = courseEmbedUrl(url);
  if (!src) return null;
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <iframe
        src={src}
        title={title}
        className="aspect-video min-h-64 w-full bg-muted"
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allow="fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-muted-foreground">
        <span>Content doesn't appear? Some websites prevent embedding.</span>
        <a
          href={safeCourseUrl(url)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-primary"
        >
          Open resource
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </section>
  );
}
