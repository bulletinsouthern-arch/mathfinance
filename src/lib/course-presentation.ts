import { z } from "zod";

export function safeCourseUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}
const link = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => !v || !!safeCourseUrl(v), "Use a complete HTTPS URL");
export const presentationSchema = z.object({
  cover: z.string().max(2000).default(""),
  sponsor: z.string().trim().max(150).default(""),
  sponsorLogo: z.string().max(2000).default(""),
  sponsorUrl: link.default(""),
  instructor: z.string().trim().max(200).default(""),
  level: z.string().trim().max(100).default(""),
  duration: z.string().trim().max(100).default(""),
  language: z.string().trim().max(100).default(""),
  skills: z.string().trim().max(2000).default(""),
  outcomes: z.string().trim().max(6000).default(""),
  badge: z.string().trim().max(80).default(""),
  embedUrl: link.default(""),
});
export type CoursePresentation = z.infer<typeof presentationSchema>;
export const emptyPresentation = presentationSchema.parse({});

export function courseEmbedUrl(value: string): string {
  const safe = safeCourseUrl(value);
  if (!safe) return "";
  const url = new URL(safe);
  if (url.hostname === "youtu.be")
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(url.pathname.slice(1))}`;
  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
    const id =
      url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)$/)?.[1];
    if (id) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
  }
  if (["vimeo.com", "www.vimeo.com"].includes(url.hostname) && /^\/\d+$/.test(url.pathname))
    return `https://player.vimeo.com/video${url.pathname}`;
  return safe;
}
