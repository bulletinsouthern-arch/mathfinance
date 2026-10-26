import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpen, ChevronRight, FileText, Pencil, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QuestionEditor } from "@/components/admin/QuizBuilder";
import { SignedImage } from "@/components/SignedImage";
import { BlockEditor } from "@/components/admin/BlockEditor";

type Subject = { id: string; name: string; description: string; sort_order: number };
type Course = { id: string; subject_id: string; code: string; title: string; description: string; price: number; sort_order: number };
type Unit = { id: string; course_id: string; title: string; sort_order: number };
type Section = { id: string; unit_id: string; title: string; content: string; sort_order: number };

function refresh(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ["admin-subjects", "admin-all-courses", "subjects", "courses", "admin-units", "admin-sections", "units", "sections"]) qc.invalidateQueries({ queryKey: [k] });
}

/** ONE list of course cards. Clicking a card (or "New course") opens ONE window that edits everything. */
export function CourseBuilder() {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const { data: subjects = [] } = useQuery({
    queryKey: ["admin-subjects"],
    queryFn: async () => ((await supabase.from("subjects").select("id, name, description, sort_order").order("sort_order")).data ?? []) as Subject[],
  });
  const { data: courses = [] } = useQuery({
    queryKey: ["admin-all-courses"],
    queryFn: async () => ((await supabase.from("courses").select("*").order("sort_order")).data ?? []) as Course[],
  });
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "";

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Courses</h2>
          <p className="text-sm text-muted-foreground">Click a course to edit everything in one window.</p>
        </div>
        <Button onClick={() => setEditing("new")}><Plus className="mr-1.5 h-4 w-4" />New course</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {courses.map((c) => (
          <button key={c.id} onClick={() => setEditing(c.id)} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 text-left transition hover:border-primary hover:shadow-[var(--shadow-elegant)]">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><BookOpen className="h-6 w-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-serif text-lg font-bold">{c.code ? `${c.code}: ` : ""}{c.title}</span>
              <span className="block truncate text-sm text-muted-foreground">{subjectName(c.subject_id)} · {c.price > 0 ? `₱${c.price}` : "Free"}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-gold" />
          </button>
        ))}
        {courses.length === 0 && <p className="text-sm text-muted-foreground">No courses yet — press "New course".</p>}
      </div>
      {editing && <CourseEditor id={editing === "new" ? null : editing} subjects={subjects} onClose={() => setEditing(null)} onCreated={setEditing} />}
    </section>
  );
}

function CourseEditor({ id, subjects, onClose, onCreated }: { id: string | null; subjects: Subject[]; onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const { data: course } = useQuery({
    queryKey: ["admin-course", id], enabled: !!id,
    queryFn: async () => (await supabase.from("courses").select("*").eq("id", id!).maybeSingle()).data as Course | null,
  });
  const [f, setF] = useState({ subject: "", newSubject: "", code: "", title: "", price: "0", description: "" });
  useEffect(() => {
    if (course) setF({ subject: course.subject_id, newSubject: "", code: course.code, title: course.title, price: String(course.price), description: course.description });
    else if (!id) setF((x) => ({ ...x, subject: subjects[0]?.id ?? "" }));
  }, [course, id, subjects]);

  async function save() {
    if (!f.title.trim()) return void toast.error("Give the course a title");
    let subjectId = f.subject;
    if (f.subject === "__new" || !subjectId) {
      if (!f.newSubject.trim()) return void toast.error("Type the new subject name");
      const r = await supabase.from("subjects").insert({ name: f.newSubject.trim(), description: "", sort_order: subjects.length }).select("id").single();
      if (r.error) return void toast.error(r.error.message);
      subjectId = r.data.id;
    }
    const row = { subject_id: subjectId, code: f.code.trim(), title: f.title.trim(), price: Number(f.price) || 0, description: f.description.trim() };
    if (id) {
      const { error } = await supabase.from("courses").update(row).eq("id", id);
      if (error) return void toast.error(error.message);
      toast.success("Course saved");
    } else {
      const r = await supabase.from("courses").insert({ ...row, sort_order: 999 }).select("id").single();
      if (r.error) return void toast.error(r.error.message);
      toast.success("Course created — now add units and pages");
      onCreated(r.data.id);
    }
    refresh(qc); qc.invalidateQueries({ queryKey: ["admin-course", id] });
  }
  async function renameSubject(sid: string) {
    const cur = subjects.find((s) => s.id === sid);
    const name = prompt("New subject name", cur?.name ?? "")?.trim();
    if (!name || name === cur?.name) return;
    const { error } = await supabase.from("subjects").update({ name }).eq("id", sid);
    if (error) return void toast.error(error.message);
    toast.success("Subject renamed"); refresh(qc);
  }
  async function deleteSubject(sid: string) {
    const cur = subjects.find((s) => s.id === sid);
    const { count } = await supabase.from("courses").select("id", { count: "exact", head: true }).eq("subject_id", sid);
    const msg = count ? `Delete "${cur?.name}"? This also deletes its ${count} course(s) and all their pages.` : `Delete "${cur?.name}"?`;
    if (!confirm(msg)) return;
    const { error } = await supabase.from("subjects").delete().eq("id", sid);
    if (error) return void toast.error(error.message);
    toast.success("Subject deleted"); refresh(qc);
    if (id && course?.subject_id === sid) onClose();
    else setF((x) => ({ ...x, subject: subjects.find((s) => s.id !== sid)?.id ?? "" }));
  }
  async function remove() {
    if (!id || !confirm("Delete this course and all its content?")) return;
    const { error } = await supabase.from("courses").delete().eq("id", id);
    if (error) return void toast.error(error.message);
    refresh(qc); onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/50 p-4" onClick={onClose}>
      <div className="my-6 w-full max-w-6xl overflow-hidden rounded-2xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between bg-primary px-6 py-4 text-primary-foreground">
          <h3 className="font-serif text-xl font-bold">{id ? `Edit ${f.code || f.title || "course"}` : "New course"}</h3>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-6 p-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-1">
              <Label className="text-xs uppercase tracking-wider">Subject</Label>
              <select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={f.subject || "__new"} onChange={(e) => setF({ ...f, subject: e.target.value })}>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value="__new">+ New subject…</option>
              </select>
              {(f.subject === "__new" || !f.subject) && <Input className="mt-2" placeholder="New subject name" value={f.newSubject} onChange={(e) => setF({ ...f, newSubject: e.target.value })} />}
              {f.subject && f.subject !== "__new" && (
                <div className="mt-2 flex gap-2 text-xs font-bold">
                  <button type="button" onClick={() => renameSubject(f.subject)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:border-primary hover:text-primary"><Pencil className="h-3 w-3" />Rename subject</button>
                  <button type="button" onClick={() => deleteSubject(f.subject)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:border-destructive hover:text-destructive"><Trash2 className="h-3 w-3" />Delete subject</button>
                </div>
              )}
            </div>
            <div><Label className="text-xs uppercase tracking-wider">Code</Label><Input className="mt-1" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="BUS101" /></div>
            <div><Label className="text-xs uppercase tracking-wider">Title</Label><Input className="mt-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
            <div><Label className="text-xs uppercase tracking-wider">Price ₱ (0 = free)</Label><Input className="mt-1" type="number" min="0" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div>
            <div className="md:col-span-4"><Label className="text-xs uppercase tracking-wider">Description</Label><Input className="mt-1" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          </div>
          <div className="flex gap-2">
            <Button onClick={save}>{id ? "Save course" : "Create course"}</Button>
            {id && <Button variant="ghost" onClick={remove}><Trash2 className="mr-1 h-4 w-4" />Delete course</Button>}
          </div>
          {id && <Curriculum courseId={id} />}
        </div>
      </div>
    </div>
  );
}

/** Left: units and pages. Right: the page editor (title, article with photos anywhere, quiz). */
function Curriculum({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const { data: units = [] } = useQuery({
    queryKey: ["admin-units", courseId],
    queryFn: async () => ((await supabase.from("course_units").select("*").eq("course_id", courseId).order("sort_order")).data ?? []) as Unit[],
  });
  const { data: sections = [] } = useQuery({
    queryKey: ["admin-sections", courseId, units.map((u) => u.id).join(",")],
    queryFn: async () => {
      const ids = units.map((u) => u.id);
      if (!ids.length) return [] as Section[];
      return ((await supabase.from("course_sections").select("*").in("unit_id", ids).order("sort_order")).data ?? []) as Section[];
    },
  });
  const [active, setActive] = useState<string | null>(null);
  const activeSec = sections.find((s) => s.id === active);

  async function addUnit() {
    const title = prompt("Unit title (e.g. The Context of Business)");
    if (!title?.trim()) return;
    const { error } = await supabase.from("course_units").insert({ course_id: courseId, title: title.trim(), sort_order: units.length });
    if (error) return void toast.error(error.message);
    refresh(qc);
  }
  async function renameUnit(u: Unit) {
    const title = prompt("Unit title", u.title);
    if (!title?.trim()) return;
    await supabase.from("course_units").update({ title: title.trim() }).eq("id", u.id);
    refresh(qc);
  }
  async function deleteUnit(u: Unit) {
    if (!confirm(`Delete "${u.title}" and its pages?`)) return;
    await supabase.from("course_units").delete().eq("id", u.id);
    refresh(qc);
  }
  async function addPage(u: Unit) {
    const n = sections.filter((s) => s.unit_id === u.id).length;
    const r = await supabase.from("course_sections").insert({ unit_id: u.id, title: "New page", content: "", sort_order: n }).select("id").single();
    if (r.error) return void toast.error(r.error.message);
    refresh(qc); setActive(r.data.id);
  }

  return (
    <div className="grid gap-6 border-t border-border pt-6 lg:grid-cols-[300px_1fr]">
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Course book</p>
        {units.map((u, i) => (
          <div key={u.id} className="rounded-xl border border-border">
            <div className="flex items-center gap-1 px-3 py-2">
              <button onClick={() => renameUnit(u)} className="min-w-0 flex-1 truncate text-left text-sm font-bold" title="Click to rename">{i + 1}. {u.title}</button>
              <button onClick={() => deleteUnit(u)} aria-label="Delete unit" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="space-y-0.5 border-t border-border p-2">
              {sections.filter((s) => s.unit_id === u.id).map((s) => (
                <button key={s.id} onClick={() => setActive(s.id)} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${s.id === active ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                  <FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{s.title}</span>
                </button>
              ))}
              <button onClick={() => addPage(u)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-bold text-primary hover:bg-accent"><Plus className="h-3.5 w-3.5" />Add page</button>
            </div>
          </div>
        ))}
        <Button variant="outline" className="w-full" onClick={addUnit}><Plus className="mr-1.5 h-4 w-4" />Add unit</Button>
      </div>
      <div>
        {activeSec ? <PageEditor key={activeSec.id} sec={activeSec} courseId={courseId} onDeleted={() => setActive(null)} />
          : <div className="flex h-full min-h-60 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">Pick a page on the left to edit its text, photos and quiz.</div>}
      </div>
    </div>
  );
}

function PageEditor({ sec, courseId, onDeleted }: { sec: Section; courseId: string; onDeleted: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(sec.title);
  const [content, setContent] = useState(sec.content);
  async function save() {
    const { error } = await supabase.from("course_sections").update({ title: title.trim() || sec.title, content }).eq("id", sec.id);
    if (error) return void toast.error(error.message);
    toast.success("Page saved"); refresh(qc);
  }
  async function remove() {
    if (!confirm("Delete this page?")) return;
    await supabase.from("course_sections").delete().eq("id", sec.id);
    refresh(qc); onDeleted();
  }
  return (
    <div className="space-y-4">
      <div><Label className="text-xs uppercase tracking-wider">Page title</Label><Input className="mt-1 text-lg font-bold" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <BlockEditor value={content} onChange={setContent} />
      <div className="flex gap-2">
        <Button onClick={save}>Save page</Button>
        <Button variant="ghost" onClick={remove}><Trash2 className="mr-1 h-4 w-4" />Delete page</Button>
      </div>
      <SectionQuiz sectionId={sec.id} courseId={courseId} unitId={sec.unit_id} />
    </div>
  );
}

const FORMAT_HELP = "Formatting: # Heading · ## Sub-heading · - bullet point · > highlighted note · **bold** · blank line = new paragraph";

function ContentField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  // Insert at the cursor so photos/blocks can go anywhere in the article.
  const insert = (t: string) => {
    const el = ref.current;
    const pos = el ? el.selectionStart : value.length;
    const before = value.slice(0, pos);
    const after = value.slice(pos);
    const pre = before && !before.endsWith("\n") ? "\n" : "";
    onChange(`${before}${pre}${t}${after && !t.endsWith("\n") ? "\n" : ""}${after}`);
  };
  async function addImage(file: File) {
    if (!file.type.startsWith("image/")) return void toast.error("Choose an image file");
    setUploading(true);
    const path = `lessons/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from("media").upload(path, file, { contentType: file.type });
    setUploading(false);
    if (up.error) return void toast.error(up.error.message);
    insert(`\n![Figure caption](media:${path})\n`);
    toast.success("Photo added where your cursor was — edit the caption if you like");
  }
  return (
    <div className="mt-1 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {[
          ["Intro box", "> Read this article for an overview…\n"],
          ["Heading", "# New heading\n"],
          ["Sub-heading", "## New sub-heading\n"],
          ["Bullet", "- "],
          ["+ Key Points", "## Key Points\n- First point\n- Second point\n"],
          ["+ Terms", "## Terms\nStakeholder\nA person or group with an interest in the business.\nStock\nA share of ownership in a company.\n"],
          ["+ Stakeholders", "## Stakeholders\n- Owners / shareholders\n- Employees\n- Customers\n- Suppliers\n- Community\n"],
          ["+ Example", "## Example\nWrite a short business example here.\n"],
          ["+ Note box", "> Important: write a highlighted note here.\n"],
        ].map(([l, t]) => (
          <Button key={l} type="button" size="sm" variant="outline" onClick={() => insert(t!)}>{l}</Button>
        ))}
        <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-primary bg-accent px-3 text-xs font-bold text-primary hover:bg-primary hover:text-primary-foreground">
          {uploading ? "Uploading…" : "+ Photo here"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void addImage(f); }} />
        </label>
      </div>
      <Textarea ref={ref} className="min-h-64 font-mono text-xs" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Write the article… click exactly where you want a photo (e.g. under Profit Maximization), then press + Photo here" />
      <p className="text-[11px] text-muted-foreground">{FORMAT_HELP}</p>
      <PhotoManager value={value} onChange={onChange} />
    </div>
  );
}

const IMG_LINE = /^!\[([^\]]*)\]\(([^)]+)\)$/;

/** Shows every photo in the article with caption edit and delete. */
function PhotoManager({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const lines = value.split("\n");
  const photos = lines.map((l, i) => ({ i, m: l.trim().match(IMG_LINE) })).filter((p) => p.m);
  if (!photos.length) return null;
  const setCaption = (i: number, cap: string, src: string) => { const n = [...lines]; n[i] = `![${cap.replace(/[\]\n]/g, "")}](${src})`; onChange(n.join("\n")); };
  async function del(i: number, src: string) {
    if (!confirm("Delete this photo?")) return;
    const n = lines.filter((_, k) => k !== i);
    onChange(n.join("\n").replace(/\n{3,}/g, "\n\n"));
    if (src.startsWith("media:")) await supabase.storage.from("media").remove([src.slice(6)]);
    toast.success("Photo deleted — press Save page");
  }
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-primary">Photos on this page ({photos.length})</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {photos.map(({ i, m }) => (
          <div key={i} className="space-y-1.5 rounded-md border border-border bg-muted/30 p-2">
            <SignedImage path={m![2]!.replace(/^media:/, "")} alt={m![1] || "Photo"} className="h-24 w-full rounded object-cover" />
            <Input className="h-8 text-xs" value={m![1]} placeholder="Caption" onChange={(e) => setCaption(i, e.target.value, m![2]!)} />
            <Button type="button" size="sm" variant="ghost" className="h-7 w-full text-destructive" onClick={() => del(i, m![2]!)}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionQuiz({ sectionId, courseId, unitId }: { sectionId: string; courseId: string; unitId: string }) {
  const qc = useQueryClient();
  const key = ["admin-section-quiz", sectionId];
  const { data: quiz } = useQuery({
    queryKey: key,
    queryFn: async () => (await supabase.from("quizzes").select("id, title, pass_percent").eq("section_id", sectionId).maybeSingle()).data,
  });
  const [title, setTitle] = useState("Section Quiz");
  async function add() {
    const { error } = await supabase.from("quizzes").insert({ course_id: courseId, unit_id: unitId, section_id: sectionId, title: title.trim() || "Section Quiz", pass_percent: 70 });
    if (error) return void toast.error(error.message);
    toast.success("Quiz added to this section — now add questions");
    qc.invalidateQueries({ queryKey: key });
  }
  async function remove() {
    if (!quiz || !confirm("Remove this quiz and its questions?")) return;
    const { error } = await supabase.from("quizzes").delete().eq("id", quiz.id);
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: key });
  }
  return (
    <div className="mt-4 space-y-3 rounded-lg border border-dashed border-primary/50 p-3">
      <p className="text-sm font-bold text-primary">Quiz for this section</p>
      {quiz ? (
        <>
          <div className="flex items-center gap-2"><span className="flex-1 text-sm font-semibold">{quiz.title} · pass {quiz.pass_percent}%</span><Button size="sm" variant="ghost" onClick={remove}><Trash2 className="mr-1 h-4 w-4" />Remove quiz</Button></div>
          <QuestionEditor quizId={quiz.id} />
        </>
      ) : (
        <div className="flex gap-2"><Input value={title} onChange={(e) => setTitle(e.target.value)} /><Button size="sm" onClick={add}><Plus className="mr-1 h-4 w-4" />Add quiz here</Button></div>
      )}
    </div>
  );
}
