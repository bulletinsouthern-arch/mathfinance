import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SignedImage } from "@/components/SignedImage";
import { CourseCatalogCard } from "@/components/CourseCatalogCard";
import { CourseEmbed } from "@/components/CourseEmbed";
import { Textarea } from "@/components/ui/textarea";
import {
  emptyPresentation,
  presentationSchema,
  type CoursePresentation,
} from "@/lib/course-presentation";
import {
  listCoursePresentation,
  saveCoursePresentation,
  uploadCourseArtwork,
} from "@/lib/course-presentation.functions";

export function CourseAppearance({
  courseId,
  title,
  subjectId,
}: {
  courseId: string;
  title: string;
  subjectId: string;
}) {
  const qc = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["course-presentation"],
    queryFn: () => listCoursePresentation(),
  });
  const [form, setForm] = useState<CoursePresentation>(emptyPresentation);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (data) setForm(data[courseId] ?? emptyPresentation);
  }, [data, courseId]);
  const change = (key: keyof CoursePresentation, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  async function upload(key: "cover" | "sponsorLogo", file?: File) {
    if (!file) return;
    if (
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/x-icon",
        "image/vnd.microsoft.icon",
      ].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    )
      return void toast.error("Choose a PNG, JPG, WebP, GIF or ICO image under 2 MB");
    setUploading(true);
    try {
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("Could not read image"));
        reader.readAsDataURL(file);
      });
      const path = await uploadCourseArtwork({ data: { content, type: file.type as "image/png" } });
      change(key, path);
      toast.success("Image uploaded. Save appearance to publish it.");
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }
  async function save() {
    const parsed = presentationSchema.safeParse(form);
    if (!parsed.success)
      return void toast.error(parsed.error.issues[0]?.message ?? "Check your details");
    setBusy(true);
    try {
      await saveCoursePresentation({ data: { courseId, details: parsed.data } });
      await qc.invalidateQueries({ queryKey: ["course-presentation"] });
      toast.success("Course appearance saved");
    } catch {
      toast.error("Could not save course appearance. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  if (isPending) return <p role="status">Loading course appearance…</p>;
  if (isError)
    return (
      <p role="alert">
        Could not load appearance.{" "}
        <button onClick={() => void refetch()} className="underline">
          Retry
        </button>
      </p>
    );
  return (
    <section className="course-experience space-y-5 rounded-xl border border-border p-5">
      <div>
        <h3 className="text-xl font-bold">Course appearance & resources</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Customize the photo, sponsor identity and details students see. Your site name stays the
          same.
        </p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["cover", "Background / course cover photo"],
                ["sponsorLogo", "Sponsor logo / favicon"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-2">
                <label className="block text-sm font-semibold" htmlFor={`course-${key}`}>
                  {label}
                </label>
                {form[key] && (
                  <SignedImage
                    path={form[key]}
                    alt={label}
                    className="h-24 w-full rounded-lg bg-muted object-contain"
                  />
                )}
                <Input
                  id={`course-${key}`}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/x-icon,image/vnd.microsoft.icon"
                  disabled={uploading}
                  onChange={(e) => void upload(key, e.target.files?.[0])}
                />
                {form[key] && (
                  <button
                    className="text-xs text-primary underline"
                    onClick={() => change(key, "")}
                  >
                    Remove image
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["sponsor", "Sponsor / institution name", "Your institution"],
                ["sponsorUrl", "Sponsor website (HTTPS)", "https://…"],
                ["instructor", "Instructor", "Instructor name"],
                ["level", "Level", "Beginner"],
                ["duration", "Estimated duration", "4 weeks, 3 hours per week"],
                ["language", "Language", "English"],
                ["badge", "Course badge (optional)", "Recently updated"],
              ] as const
            ).map(([key, label, placeholder]) => (
              <label key={key} className="space-y-1 text-sm font-semibold">
                <span>{label}</span>
                <Input
                  value={form[key]}
                  placeholder={placeholder}
                  onChange={(e) => change(key, e.target.value)}
                />
              </label>
            ))}
          </div>
          <label className="block space-y-1 text-sm font-semibold">
            <span>Skills (separate with commas)</span>
            <Textarea value={form.skills} onChange={(e) => change("skills", e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm font-semibold">
            <span>What students will learn (one outcome per line)</span>
            <Textarea
              rows={4}
              value={form.outcomes}
              onChange={(e) => change("outcomes", e.target.value)}
            />
          </label>
          <label className="block space-y-1 text-sm font-semibold">
            <span>Embedded course resource URL (HTTPS)</span>
            <Input
              type="url"
              value={form.embedUrl}
              placeholder="https://your-website.com/lesson"
              onChange={(e) => change("embedUrl", e.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Your own website, YouTube or Vimeo. The resource appears inside the course after access
            is granted. The linked website must permit embedding.
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Student card preview
          </p>
          <CourseCatalogCard
            course={{ id: courseId, subject_id: subjectId, title, code: "" }}
            details={form}
          />
        </div>
      </div>
      {form.embedUrl && <CourseEmbed url={form.embedUrl} title="Embedded resource preview" />}
      <Button disabled={busy || uploading} onClick={() => void save()}>
        {busy ? "Saving…" : uploading ? "Uploading image…" : "Save appearance & resources"}
      </Button>
    </section>
  );
}
