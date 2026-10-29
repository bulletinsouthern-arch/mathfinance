import { CoursePlans } from "./CoursePlans";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { BookOpen, ChevronRight, ClipboardList, FileText, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QuestionEditor } from "@/components/admin/QuizBuilder";
import { SignedImage } from "@/components/SignedImage";
import { listUnitNumbers, saveUnitNumber } from "@/lib/unit-numbers.functions";
import { BlockEditor } from "@/components/admin/BlockEditor";

type Subject = { id: string; name: string; description: string; sort_order: number };
type Course = { id: string; subject_id: string; code: string; title: string; description: string; price: number; sort_order: number };
type Unit = { id: string; course_id: string; title: string; sort_order: number };
type Section = { id: string; unit_id: string; title: string; content: string; sort_order: number };

function refresh(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ["admin-subjects", "admin-all-courses", "subjects", "courses", "admin-units", "admin-sections", "units", "sections", "subject-courses", "course"]) qc.invalidateQueries({ queryKey: [k] });
}

/** ONE list of course cards. Clicking a card (or "New course") opens ONE window that edits everything. */
export function CourseBuilder() {
  const [subjectFilter,setSubjectFilter]=useState("");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const { data: subjects = [], isError: subjectsError, refetch: retrySubjects } = useQuery({
    queryKey: ["admin-subjects"],
    queryFn: async () => { const { data, error } = await supabase.from("subjects").select("id, name, description, sort_order").order("sort_order"); if (error) throw new Error("Could not load subjects"); return (data ?? []) as Subject[]; },
  });
  const { data: courses = [], isError: coursesError, refetch: retryCourses } = useQuery({
    queryKey: ["admin-all-courses"],
    queryFn: async () => { const { data, error } = await supabase.from("courses").select("*").order("sort_order"); if (error) throw new Error("Could not load courses"); return (data ?? []) as Course[]; },
  });
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "";

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Courses</h2>
          <p className="text-sm text-muted-foreground">Click a course to edit everything in one window.</p>
        </div>
        <Button disabled={subjectsError || coursesError} onClick={() => setEditing("new")}><Plus className="mr-1.5 h-4 w-4" />New course</Button>
      </div>
      {(subjectsError || coursesError) && <p role="alert">Could not load the course builder. <button className="underline" onClick={() => { void retrySubjects(); void retryCourses(); }}>Retry</button></p>}
      <label className="block text-sm font-semibold">Filter by subject<select className="mt-2 block h-10 w-full rounded-lg border border-input bg-background px-3" value={subjectFilter} onChange={e=>setSubjectFilter(e.target.value)}><option value="">All subjects</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <div className="grid gap-4 md:grid-cols-2">
        {courses.filter(c=>!subjectFilter||c.subject_id===subjectFilter).map((c) => (
          <button key={c.id} onClick={() => setEditing(c.id)} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 text-left transition hover:border-primary hover:shadow-[var(--shadow-elegant)]">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><BookOpen className="h-6 w-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-serif text-lg font-bold">{c.code ? `${c.code}: ` : ""}{c.title}</span>
              <span className="block truncate text-sm text-muted-foreground">{subjectName(c.subject_id)} · {c.price > 0 ? `₱${c.price}` : "Free"}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-gold" />
          </button>
        ))}
        {!coursesError && courses.length === 0 && <p className="text-sm text-muted-foreground">No courses yet — press "New course".</p>}
      </div>
      {editing && <CourseEditor key={editing} id={editing === "new" ? null : editing} subjects={subjects} onClose={() => setEditing(null)} onCreated={setEditing} />}
    </section>
  );
}

function CourseEditor({ id, subjects, onClose, onCreated }: { id: string | null; subjects: Subject[]; onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const { data: course, isError: courseError, refetch: retryCourse } = useQuery({
    queryKey: ["admin-course", id], enabled: !!id,
    queryFn: async () => { const { data, error } = await supabase.from("courses").select("*").eq("id", id!).maybeSingle(); if (error || !data) throw new Error("Course unavailable"); return data as Course; },
  });
  const [f, setF] = useState({ subject: "", newSubject: "", code: "", title: "", price: "0", description: "" });
  useEffect(() => {
    if (course) setF({ subject: course.subject_id, newSubject: "", code: course.code, title: course.title, price: String(course.price), description: course.description });
    else if (!id) setF({ subject: "__new", newSubject: "", code: "", title: "", price: "0", description: "" });
  }, [course, id]);

  async function save() {
    if(!Number.isFinite(Number(f.price)) || Number(f.price)<0) return void toast.error("Enter a valid nonnegative course price");
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
    const { count, error: countError } = await supabase.from("courses").select("id", { count: "exact", head: true }).eq("subject_id", sid);
    if (countError) return void toast.error("Could not check subject ownership");
    if ((count ?? 0) > 1) return void toast.error("This subject is shared. Choose New subject to give this course its own subject.");
    const cur = subjects.find((s) => s.id === sid);
    const name = prompt("New subject name", cur?.name ?? "")?.trim();
    if (!name || name === cur?.name) return;
    const { error } = await supabase.from("subjects").update({ name }).eq("id", sid);
    if (error) return void toast.error(error.message);
    toast.success("Subject renamed"); refresh(qc);
  }
  async function deleteSubject(sid: string) {
    const cur = subjects.find((s) => s.id === sid);
    const { count, error: countError } = await supabase.from("courses").select("id", { count: "exact", head: true }).eq("subject_id", sid);
    if (countError) return void toast.error("Could not check subject ownership");
    if ((count ?? 0) > 1) return void toast.error("This subject belongs to other courses and cannot be deleted here.");
    const msg = count ? `Delete "${cur?.name}"? This also deletes its ${count} course(s) and all their pages.` : `Delete "${cur?.name}"?`;
    if (!confirm(msg)) return;
    const { error } = await supabase.from("subjects").delete().eq("id", sid);
    if (error) return void toast.error(error.message);
    toast.success("Subject deleted"); refresh(qc);
    if (id && course?.subject_id === sid) onClose();
    else setF((x) => ({ ...x, subject: "__new", newSubject: "" }));
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
          {id && !course && <p role={courseError ? "alert" : "status"}>{courseError ? <>Could not load this course. <button className="underline" onClick={() => void retryCourse()}>Retry</button></> : "Loading course…"}</p>}
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-1">
              <Label className="text-xs uppercase tracking-wider">Subject</Label>
              <select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={f.subject || "__new"} onChange={(e) => setF({ ...f, subject: e.target.value })}>
                {subjects.filter((s) => s.id === course?.subject_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
            <Button disabled={!!id && !course} onClick={save}>{id ? "Save course" : "Create course"}</Button>
            {id && <Button variant="ghost" onClick={remove}><Trash2 className="mr-1 h-4 w-4" />Delete course</Button>}
          </div>
          {id && <CoursePlans key={`plans-${id}`} courseId={id}/>}
          {id && <Curriculum key={id} courseId={id} />}
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
  const { data: quizzes = [] } = useQuery({
    queryKey: ["admin-course-quizzes", courseId],
    queryFn: async () => ((await supabase.from("quizzes").select("id, title, kind, unit_id, section_id, sort_order").eq("course_id", courseId).order("sort_order")).data ?? []) as { id: string; title: string; kind: string; unit_id: string | null; section_id: string | null }[],
  });
  const { data: unitNumbers, isError: numberError, refetch: retryNumbers } = useQuery({
    queryKey: ["unit-numbers", courseId],
    queryFn: () => listUnitNumbers({ data: { courseId } }),
  });
  const [unitDraft, setUnitDraft] = useState<{ id: string; number: string; title: string; isNew: boolean } | null>(null);
  const [savingUnit, setSavingUnit] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ type: "unit" | "page" | "quiz"; id: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const activeSec = sections.find((s) => s.id === active);
  const reload = () => { refresh(qc); qc.invalidateQueries({ queryKey: ["admin-course-quizzes", courseId] }); qc.invalidateQueries({ queryKey: ["quizzes"] }); qc.invalidateQueries({ queryKey: ["admin-section-quiz"] }); };

  async function dropOnUnit(target: Unit) {
    if (!drag) return;
    if (drag.type === "unit" && drag.id !== target.id) {
      const order = units.filter((u) => u.id !== drag.id);
      order.splice(order.findIndex((u) => u.id === target.id), 0, units.find((u) => u.id === drag.id)!);
      await Promise.all(order.map((u, i) => supabase.from("course_units").update({ sort_order: i }).eq("id", u.id)));
    } else if (drag.type === "page") {
      const n = sections.filter((s) => s.unit_id === target.id && s.id !== drag.id).length;
      await supabase.from("course_sections").update({ unit_id: target.id, sort_order: n }).eq("id", drag.id);
    } else if (drag.type === "quiz") {
      await supabase.from("quizzes").update({ unit_id: target.id, section_id: null }).eq("id", drag.id);
    }
    setDrag(null); setOver(null); reload();
  }
  async function dropOnPage(target: Section) {
    if (!drag) return;
    if (drag.type === "page" && drag.id !== target.id) {
      const moving = sections.find((s) => s.id === drag.id)!;
      const list = sections.filter((s) => s.unit_id === target.unit_id && s.id !== drag.id);
      list.splice(list.findIndex((s) => s.id === target.id), 0, moving);
      await Promise.all(list.map((s, i) => supabase.from("course_sections").update({ unit_id: target.unit_id, sort_order: i }).eq("id", s.id)));
    } else if (drag.type === "quiz") {
      await supabase.from("quizzes").update({ unit_id: target.unit_id, section_id: target.id }).eq("id", drag.id);
    } else if (drag.type === "unit") {
      const u = units.find((x) => x.id === target.unit_id); if (u) return dropOnUnit(u);
    }
    setDrag(null); setOver(null); reload();
  }
  const dnd = (key: string, onDrop: () => void) => ({
    onDragOver: (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setOver(key); },
    onDragLeave: () => setOver((o) => (o === key ? null : o)),
    onDrop: (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); void onDrop(); },
  });

  function addUnit() {
    setUnitDraft({ id: crypto.randomUUID(), number: "", title: "", isNew: true });
  }
  function renameUnit(u: Unit) {
    setUnitDraft({ id: u.id, number: unitNumbers?.[u.id] ?? String(units.findIndex((x) => x.id === u.id) + 1), title: u.title, isNew: false });
  }
  async function saveUnit() {
    if (!unitDraft || savingUnit) return;
    if (!/^\d+(?:\.\d+)*$/.test(unitDraft.number.trim()) || unitDraft.number.trim().length > 100) return void toast.error("Enter a unit number such as 1, 1.2, or 2.10");
    if (!unitDraft.title.trim()) return void toast.error("Give the unit a title");
    setSavingUnit(true);
    try {
      await saveUnitNumber({ data: { courseId, unitId: unitDraft.id, number: unitDraft.number.trim() } });
      const row = { title: unitDraft.title.trim() };
      const result = unitDraft.isNew
        ? await supabase.from("course_units").insert({ ...row, id: unitDraft.id, course_id: courseId, sort_order: units.length })
        : await supabase.from("course_units").update(row).eq("id", unitDraft.id);
      if (result.error) throw result.error;
      setUnitDraft(null);
      toast.success("Unit saved");
      refresh(qc);
    } catch {
      toast.error("Could not save the unit. Your entries are kept; please try again.");
    } finally {
      await qc.invalidateQueries({ queryKey: ["unit-numbers", courseId] });
      setSavingUnit(false);
    }
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
  async function addTest(u: Unit, kind: "quiz" | "exam") {
    const title = prompt(kind === "exam" ? "Exam name (e.g. Unit 1 Exam)" : "Quiz name (e.g. Unit 1 Quiz)");
    if (!title?.trim()) return;
    const { error } = await supabase.from("quizzes").insert({ course_id: courseId, unit_id: u.id, title: title.trim(), kind, pass_percent: 70, sort_order: quizzes.length });
    if (error) return void toast.error(error.message);
    toast.success(`${kind === "exam" ? "Exam" : "Quiz"} added — drag it onto any page to place it there`); reload();
  }
  async function renameTest(q: { id: string; title: string }) {
    const title = prompt("New name", q.title)?.trim();
    if (!title || title === q.title) return;
    await supabase.from("quizzes").update({ title }).eq("id", q.id); reload();
  }
  function unitForm() {
    return unitDraft && (
          <form className="space-y-3 rounded-xl border border-border bg-muted/30 p-3" onSubmit={(e) => { e.preventDefault(); void saveUnit(); }}>
            <p className="text-sm font-bold">{unitDraft.isNew ? "Add unit" : "Edit unit"}</p>
            <div><Label htmlFor="unit-number">Unit number</Label><Input autoFocus id="unit-number" type="text" placeholder="e.g. 1.1 or 2.10" maxLength={100} required disabled={savingUnit} value={unitDraft.number} onChange={(e) => setUnitDraft({ ...unitDraft, number: e.target.value })} /></div>
            <p className="text-xs text-muted-foreground">Choose your own number: 1, 1.1, 1.2, 2.1, 2.2, or 2.10. You can change it anytime; dragging never changes it.</p>
            <div><Label htmlFor="unit-title">Unit title</Label><Input id="unit-title" required disabled={savingUnit} value={unitDraft.title} onChange={(e) => setUnitDraft({ ...unitDraft, title: e.target.value })} /></div>
            <div className="flex gap-2"><Button type="submit" disabled={savingUnit}>{savingUnit ? "Saving…" : "Save unit"}</Button><Button type="button" variant="ghost" disabled={savingUnit} onClick={() => setUnitDraft(null)}>Cancel</Button></div>
          </form>
    );
  }
  const testRow = (q: { id: string; title: string; kind: string }) => (
    <div key={q.id} draggable onDragStart={() => setDrag({ type: "quiz", id: q.id })} onDragEnd={() => { setDrag(null); setOver(null); }}
      className="ml-5 flex cursor-grab items-center gap-1.5 rounded-md border border-dashed border-gold/60 px-2 py-1 text-xs font-bold text-primary" title="Drag onto any page or unit">
      <GripVertical className="h-3 w-3 shrink-0 opacity-50" /><ClipboardList className="h-3.5 w-3.5 shrink-0" />
      <button onClick={() => renameTest(q)} className="min-w-0 flex-1 truncate text-left" title="Click to rename">{q.kind === "exam" ? "EXAM · " : "Quiz · "}{q.title}</button>
    </div>
  );

  return (
    <div className="grid gap-6 border-t border-border pt-6 lg:grid-cols-[320px_1fr]">
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Course book</p>
        <p className="text-[11px] text-muted-foreground">Drag ⋮⋮ to move units, pages, quizzes and exams. Click Edit number on any unit to change its number and title. Custom numbers stay the same when dragged.</p>
        {numberError && <p role="alert" className="text-sm text-destructive">Could not load unit numbers. <button onClick={() => retryNumbers()} className="underline">Retry</button></p>}
        {unitDraft?.isNew && unitForm()}
        {units.map((u, i) => (
          <div key={u.id} {...dnd("u" + u.id, () => dropOnUnit(u))} className={`rounded-xl border ${over === "u" + u.id ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
            <div className="flex items-center gap-1 px-2 py-2" draggable onDragStart={() => setDrag({ type: "unit", id: u.id })} onDragEnd={() => { setDrag(null); setOver(null); }}>
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
              <button onClick={() => renameUnit(u)} className="min-w-0 flex-1 truncate text-left text-sm font-bold" disabled={!unitNumbers || savingUnit || (!!unitDraft && unitDraft.id !== u.id)} title="Edit unit number and title">{unitNumbers ? (unitNumbers[u.id] ?? String(i + 1)) : "…"}. {u.title}</button>
              <button onClick={() => renameUnit(u)} disabled={!unitNumbers || savingUnit || (!!unitDraft && unitDraft.id !== u.id)} aria-label={`Edit number for ${u.title}`} className="flex shrink-0 items-center gap-1 rounded-md px-1 py-1 text-xs font-semibold text-primary hover:bg-accent"><Pencil className="h-3.5 w-3.5" /><span>Edit number</span></button>
              <button onClick={() => deleteUnit(u)} aria-label="Delete unit" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
            {unitDraft?.id === u.id && unitForm()}
            <div className="space-y-0.5 border-t border-border p-2">
              {sections.filter((s) => s.unit_id === u.id).map((s) => (
                <div key={s.id} className="space-y-0.5">
                  <div draggable onDragStart={(e) => { e.stopPropagation(); setDrag({ type: "page", id: s.id }); }} onDragEnd={() => { setDrag(null); setOver(null); }} {...dnd("p" + s.id, () => dropOnPage(s))}
                    className={`flex items-center gap-1 rounded-md ${over === "p" + s.id ? "ring-2 ring-primary" : ""}`}>
                    <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground" />
                    <button onClick={() => setActive(s.id)} className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${s.id === active ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                      <FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{s.title}</span>
                    </button>
                  </div>
                  {quizzes.filter((q) => q.section_id === s.id).map(testRow)}
                </div>
              ))}
              {quizzes.filter((q) => q.unit_id === u.id && !q.section_id).map(testRow)}
              <div className="flex flex-wrap gap-1 pt-1">
                <button onClick={() => addPage(u)} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-bold text-primary hover:bg-accent"><Plus className="h-3.5 w-3.5" />Page</button>
                <button onClick={() => addTest(u, "quiz")} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-bold text-primary hover:bg-accent"><Plus className="h-3.5 w-3.5" />Quiz</button>
                <button onClick={() => addTest(u, "exam")} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-bold text-primary hover:bg-accent"><Plus className="h-3.5 w-3.5" />Exam</button>
              </div>
            </div>
          </div>
        ))}
        <Button disabled={savingUnit || !!unitDraft || !unitNumbers} variant="outline" className="w-full" onClick={addUnit}><Plus className="mr-1.5 h-4 w-4" />Add unit</Button>
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
  const [saving, setSaving] = useState(false);
  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("course_sections").update({ title: title.trim() || sec.title, content }).eq("id", sec.id);
      if (error) throw error;
      toast.success("Page saved"); refresh(qc);
    } catch {
      toast.error("Page was not saved. Your text is still here. Check your connection or sign in again, then retry.");
    } finally {
      setSaving(false);
    }
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
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save page"}</Button>
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

type SecQuiz = { id: string; title: string; kind: string; pass_percent: number; time_limit_minutes: number };
function SectionQuiz({ sectionId, courseId, unitId }: { sectionId: string; courseId: string; unitId: string }) {
  const qc = useQueryClient();
  const key = ["admin-section-quiz", sectionId];
  const { data: list = [] } = useQuery({
    queryKey: key,
    queryFn: async () => ((await supabase.from("quizzes").select("id, title, kind, pass_percent, time_limit_minutes").eq("section_id", sectionId).order("sort_order")).data ?? []) as SecQuiz[],
  });
  const [title, setTitle] = useState("Section Quiz");
  const [kind, setKind] = useState<"quiz" | "exam">("quiz");
  const [open, setOpen] = useState<string | null>(null);
  const inval = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["admin-course-quizzes", courseId] }); qc.invalidateQueries({ queryKey: ["quizzes"] }); };
  async function add() {
    const r = await supabase.from("quizzes").insert({ course_id: courseId, unit_id: unitId, section_id: sectionId, title: title.trim() || "Section Quiz", kind, pass_percent: 70 }).select("id").single();
    if (r.error) return void toast.error(r.error.message);
    toast.success(`${kind === "exam" ? "Exam" : "Quiz"} added to this page — now add questions`);
    setOpen(r.data.id); inval();
  }
  async function update(id: string, patch: Partial<SecQuiz>) {
    const { error } = await supabase.from("quizzes").update(patch).eq("id", id);
    if (error) return void toast.error(error.message);
    toast.success("Saved"); inval();
  }
  async function remove(id: string) {
    if (!confirm("Remove this and its questions?")) return;
    const { error } = await supabase.from("quizzes").delete().eq("id", id);
    if (error) return void toast.error(error.message);
    inval();
  }
  return (
    <div className="mt-4 space-y-3 rounded-lg border border-dashed border-primary/50 p-3">
      <p className="text-sm font-bold text-primary">Quizzes & exams on this page</p>
      {list.map((q) => (
        <div key={q.id} className="space-y-2 rounded-md border border-border p-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_100px_80px_80px_auto]">
            <Input key={q.title} aria-label="Name" defaultValue={q.title} onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== q.title) void update(q.id, { title: t }); }} />
            <select aria-label="Type" className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={q.kind} onChange={(e) => update(q.id, { kind: e.target.value })}><option value="quiz">Quiz</option><option value="exam">Exam</option></select>
            <Input aria-label="Pass %" title="Pass %" type="number" min="1" max="100" defaultValue={q.pass_percent} onBlur={(e) => Number(e.target.value) !== q.pass_percent && update(q.id, { pass_percent: Math.min(100, Math.max(1, Number(e.target.value) || 70)) })} />
            <Input aria-label="Minutes" title="Time limit in minutes (0 = none)" type="number" min="0" defaultValue={q.time_limit_minutes} onBlur={(e) => Number(e.target.value) !== q.time_limit_minutes && update(q.id, { time_limit_minutes: Math.max(0, Number(e.target.value) || 0) })} />
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => setOpen(open === q.id ? null : q.id)}>{open === q.id ? "Hide" : "Questions"}</Button>
              <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => remove(q.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Name · Type · Pass % · Minutes (0 = no limit)</p>
          {open === q.id && <QuestionEditor quizId={q.id} />}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Input className="min-w-40 flex-1" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value as "quiz" | "exam")}><option value="quiz">Quiz</option><option value="exam">Exam</option></select>
        <Button size="sm" className="h-10" onClick={add}><Plus className="mr-1 h-4 w-4" />Add here</Button>
      </div>
    </div>
  );
}
