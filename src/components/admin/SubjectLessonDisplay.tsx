import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { defaultLessonDisplay, type LessonDisplay } from "@/lib/blocks";
import { getSubjectLessonDisplay, saveSubjectLessonDisplay } from "@/lib/subject-display.functions";

const options = [
  ["text", "Lesson text", "Articles, definitions and key points"],
  ["photos", "Photos", "Uploaded figures and captions"],
  ["videos", "Videos & embeds", "YouTube players and embedded resources"],
  ["listen", "Listen", "Read lesson text aloud at a normal pace"],
] as const;

export function SubjectLessonDisplay({ subjectId }: { subjectId: string }) {
  const qc = useQueryClient();
  const queryKey = ["subject-lesson-display", subjectId];
  const { data, isPending, isError, refetch } = useQuery({ queryKey, queryFn: () => getSubjectLessonDisplay({ data: { subjectId } }) });
  const [settings, setSettings] = useState<LessonDisplay>(defaultLessonDisplay);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setSettings(data); }, [data]);
  if (isPending) return <p role="status">Loading subject display settings…</p>;
  if (isError) return <p role="alert">Could not load subject display settings. <button className="underline" onClick={() => void refetch()}>Retry</button></p>;
  async function save() {
    setBusy(true);
    try {
      await saveSubjectLessonDisplay({ data: { subjectId, settings } });
      await qc.invalidateQueries({ queryKey });
      toast.success("Subject display saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save display settings"); }
    finally { setBusy(false); }
  }
  return <section className="rounded-xl border border-primary/25 bg-accent/25 p-5 space-y-4">
    <div><p className="text-xs font-bold uppercase tracking-widest text-primary">Student experience</p><h3 className="mt-1 text-lg font-bold">What appears in this subject?</h3><p className="text-sm text-muted-foreground">Applies to every course in this subject. Hidden content stays saved for later.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">{options.map(([key, label, help]) => <label key={key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={settings[key]} disabled={busy} onChange={e => setSettings(s => ({ ...s, [key]: e.target.checked }))} /><span><span className="block text-sm font-bold">{label}</span><span className="text-xs text-muted-foreground">{help}</span></span></label>)}</div>
    <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold">Quick setup:</span><Button size="sm" variant="outline" disabled={busy} onClick={() => setSettings(defaultLessonDisplay)}>All content</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => setSettings({ text: false, photos: false, videos: true, listen: false })}>Video only</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => setSettings({ text: false, photos: true, videos: false, listen: false })}>Photos only</Button></div>
    {!settings.text && <p className="text-xs text-muted-foreground">Listen is hidden while lesson text is off.</p>}
    <Button disabled={busy || !(settings.text || settings.photos || settings.videos)} onClick={save}>{busy ? "Saving…" : "Save subject display"}</Button>
  </section>;
}
