import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, ChevronRight, Layers, ListTree, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Subject = { id: string; name: string; description: string; sort_order: number };
type Course = { id: string; subject_id: string; code: string; title: string; description: string; price: number; sort_order: number };
type Unit = { id: string; course_id: string; title: string; sort_order: number };
type Section = { id: string; unit_id: string; title: string; content: string; sort_order: number };

export function CourseBuilder() {
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SubjectsPanel selected={subjectId} onSelect={(id) => { setSubjectId(id); setCourseId(null); setUnitId(null); }} />
      {subjectId && <CoursesPanel subjectId={subjectId} selected={courseId} onSelect={(id) => { setCourseId(id); setUnitId(null); }} />}
      {courseId && <UnitsPanel courseId={courseId} selected={unitId} onSelect={setUnitId} />}
      {unitId && <SectionsPanel unitId={unitId} />}
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof BookOpen; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <h3 className="flex items-center gap-2 text-xl font-semibold"><Icon className="h-5 w-5 text-primary" />{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, sub, active, onClick, onDelete }: { label: string; sub?: string; active?: boolean; onClick?: () => void; onDelete: () => void }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${active ? "border-primary bg-accent" : "border-border"}`}>
      <button onClick={onClick} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium">{label}</span>
        {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
      </button>
      {onClick && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
      <Button size="icon" variant="ghost" aria-label="Delete" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
}

function SubjectsPanel({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const qc = useQueryClient();
  const { data: subjects = [] } = useQuery({
    queryKey: ["admin-subjects"],
    queryFn: async () => ((await supabase.from("subjects").select("id, name, description, sort_order").order("sort_order")).data ?? []) as Subject[],
  });
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  async function add() {
    if (!name.trim()) return void toast.error("Name the subject");
    const { error } = await supabase.from("subjects").insert({ name: name.trim(), description: desc.trim(), sort_order: subjects.length });
    if (error) return void toast.error(error.message);
    toast.success("Subject added");
    setName(""); setDesc("");
    qc.invalidateQueries({ queryKey: ["admin-subjects"] });
    qc.invalidateQueries({ queryKey: ["subjects"] });
  }
  async function remove(id: string) {
    if (!confirm("Delete this subject and all its courses?")) return;
    const { error } = await supabase.from("subjects").delete().eq("id", id);
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-subjects"] });
    qc.invalidateQueries({ queryKey: ["subjects"] });
  }

  return (
    <Panel title="Subjects" icon={Layers}>
      <div className="space-y-2">
        {subjects.map((s) => (
          <Row key={s.id} label={s.name} sub={s.description} active={s.id === selected} onClick={() => onSelect(s.id)} onDelete={() => remove(s.id)} />
        ))}
        {subjects.length === 0 && <p className="text-xs text-muted-foreground">No subjects yet — add your first one below.</p>}
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <div><Label>Subject name</Label><Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Business Administration" /></div>
        <div><Label>Short description</Label><Input className="mt-1" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional" /></div>
        <Button onClick={add}><Plus className="mr-1.5 h-4 w-4" />Add subject</Button>
      </div>
    </Panel>
  );
}

function CoursesPanel({ subjectId, selected, onSelect }: { subjectId: string; selected: string | null; onSelect: (id: string) => void }) {
  const qc = useQueryClient();
  const { data: courses = [] } = useQuery({
    queryKey: ["admin-courses", subjectId],
    queryFn: async () => ((await supabase.from("courses").select("*").eq("subject_id", subjectId).order("sort_order")).data ?? []) as Course[],
  });
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("0");

  async function add() {
    if (!title.trim()) return void toast.error("Name the course");
    const { error } = await supabase.from("courses").insert({ subject_id: subjectId, code: code.trim(), title: title.trim(), description: desc.trim(), price: Number(price) || 0, sort_order: courses.length });
    if (error) return void toast.error(error.message);
    toast.success("Course added");
    setCode(""); setTitle(""); setDesc(""); setPrice("0");
    qc.invalidateQueries({ queryKey: ["admin-courses", subjectId] });
    qc.invalidateQueries({ queryKey: ["courses"] });
  }
  async function remove(id: string) {
    if (!confirm("Delete this course and all its content?")) return;
    const { error } = await supabase.from("courses").delete().eq("id", id);
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-courses", subjectId] });
    qc.invalidateQueries({ queryKey: ["courses"] });
  }

  return (
    <Panel title="Courses" icon={BookOpen}>
      <div className="space-y-2">
        {courses.map((c) => (
          <Row key={c.id} label={`${c.code ? `${c.code}: ` : ""}${c.title}`} sub={c.price > 0 ? `₱${c.price}` : "Free"} active={c.id === selected} onClick={() => onSelect(c.id)} onDelete={() => remove(c.id)} />
        ))}
        {courses.length === 0 && <p className="text-xs text-muted-foreground">No courses in this subject yet.</p>}
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Code</Label><Input className="mt-1" value={code} onChange={(e) => setCode(e.target.value)} placeholder="BUS101" /></div>
          <div><Label>Price (₱, 0 = free)</Label><Input className="mt-1" type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        </div>
        <div><Label>Title</Label><Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Introduction to Business" /></div>
        <div><Label>Description</Label><Input className="mt-1" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional" /></div>
        <Button onClick={add}><Plus className="mr-1.5 h-4 w-4" />Add course</Button>
      </div>
    </Panel>
  );
}

function UnitsPanel({ courseId, selected, onSelect }: { courseId: string; selected: string | null; onSelect: (id: string) => void }) {
  const qc = useQueryClient();
  const { data: units = [] } = useQuery({
    queryKey: ["admin-units", courseId],
    queryFn: async () => ((await supabase.from("course_units").select("*").eq("course_id", courseId).order("sort_order")).data ?? []) as Unit[],
  });
  const [title, setTitle] = useState("");

  async function add() {
    if (!title.trim()) return void toast.error("Name the unit");
    const { error } = await supabase.from("course_units").insert({ course_id: courseId, title: title.trim(), sort_order: units.length });
    if (error) return void toast.error(error.message);
    toast.success("Unit added");
    setTitle("");
    qc.invalidateQueries({ queryKey: ["admin-units", courseId] });
  }
  async function remove(id: string) {
    if (!confirm("Delete this unit and its sections?")) return;
    const { error } = await supabase.from("course_units").delete().eq("id", id);
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-units", courseId] });
  }

  return (
    <Panel title="Units" icon={ListTree}>
      <div className="space-y-2">
        {units.map((u, i) => (
          <Row key={u.id} label={`${i + 1}. ${u.title}`} active={u.id === selected} onClick={() => onSelect(u.id)} onDelete={() => remove(u.id)} />
        ))}
        {units.length === 0 && <p className="text-xs text-muted-foreground">No units yet — e.g. "The Context of Business".</p>}
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <div><Label>Unit title</Label><Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The Context of Business" /></div>
        <Button onClick={add}><Plus className="mr-1.5 h-4 w-4" />Add unit</Button>
      </div>
    </Panel>
  );
}

function SectionsPanel({ unitId }: { unitId: string }) {
  const qc = useQueryClient();
  const { data: sections = [] } = useQuery({
    queryKey: ["admin-sections", unitId],
    queryFn: async () => ((await supabase.from("course_sections").select("*").eq("unit_id", unitId).order("sort_order")).data ?? []) as Section[],
  });
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  async function add() {
    if (!title.trim()) return void toast.error("Name the section");
    const { error } = await supabase.from("course_sections").insert({ unit_id: unitId, title: title.trim(), content, sort_order: sections.length });
    if (error) return void toast.error(error.message);
    toast.success("Section added");
    setTitle(""); setContent("");
    qc.invalidateQueries({ queryKey: ["admin-sections", unitId] });
  }
  async function remove(id: string) {
    if (!confirm("Delete this section?")) return;
    const { error } = await supabase.from("course_sections").delete().eq("id", id);
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-sections", unitId] });
  }
  async function saveContent(sec: Section, newContent: string, newTitle: string) {
    const { error } = await supabase.from("course_sections").update({ content: newContent, title: newTitle.trim() || sec.title }).eq("id", sec.id);
    if (error) return void toast.error(error.message);
    toast.success("Section saved");
    qc.invalidateQueries({ queryKey: ["admin-sections", unitId] });
  }

  return (
    <Panel title="Sections" icon={BookOpen}>
      <div className="space-y-3">
        {sections.map((sec) => (
          <SectionEditor key={sec.id} sec={sec} onSave={saveContent} onDelete={() => remove(sec.id)} />
        ))}
        {sections.length === 0 && <p className="text-xs text-muted-foreground">No sections yet — these are the pages students read.</p>}
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <div><Label>Section title</Label><Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. What is a Business?" /></div>
        <div><Label>Content</Label><ContentField value={content} onChange={setContent} /></div>
        <Button onClick={add}><Plus className="mr-1.5 h-4 w-4" />Add section</Button>
      </div>
    </Panel>
  );
}

const FORMAT_HELP = "Formatting: # Heading · ## Sub-heading · - bullet point · > highlighted note · **bold** · blank line = new paragraph";

function ContentField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [uploading, setUploading] = useState(false);
  async function addImage(file: File) {
    if (!file.type.startsWith("image/")) return void toast.error("Choose an image file");
    setUploading(true);
    const path = `lessons/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from("media").upload(path, file, { contentType: file.type });
    setUploading(false);
    if (up.error) return void toast.error(up.error.message);
    onChange(`${value}${value.endsWith("\n") || !value ? "" : "\n"}\n![Figure caption](media:${path})\n`);
    toast.success("Image added — edit the caption text if you like");
  }
  const insert = (t: string) => onChange(`${value}${value && !value.endsWith("\n") ? "\n" : ""}${t}`);
  return (
    <div className="mt-1 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {[["Heading", "# Key Points\n"], ["Sub-heading", "## Terms\n"], ["Bullet", "- "], ["Note box", "> Read this article for an overview…\n"]].map(([l, t]) => (
          <Button key={l} type="button" size="sm" variant="outline" onClick={() => insert(t!)}>{l}</Button>
        ))}
        <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-input px-3 text-xs font-semibold hover:border-primary">
          {uploading ? "Uploading…" : "+ Image"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && addImage(e.target.files[0])} />
        </label>
      </div>
      <Textarea className="min-h-48 font-mono text-xs" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Write the article…" />
      <p className="text-[11px] text-muted-foreground">{FORMAT_HELP}</p>
    </div>
  );
}

function SectionEditor({ sec, onSave, onDelete }: { sec: Section; onSave: (sec: Section, content: string, title: string) => void; onDelete: () => void }) {
  const [content, setContent] = useState(sec.content);
  const [title, setTitle] = useState(sec.title);
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={() => setOpen(!open)} className="min-w-0 flex-1 truncate text-left text-sm font-medium">{sec.title}</button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>{open ? "Close" : "Edit"}</Button>
        <Button size="icon" variant="ghost" aria-label="Delete" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
      </div>
      {open && (
        <div className="space-y-2 border-t border-border p-3">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          <Label>Article</Label>
          <ContentField value={content} onChange={setContent} />
          <Button size="sm" onClick={() => onSave(sec, content, title)}>Save section</Button>
        </div>
      )}
    </div>
  );
}
