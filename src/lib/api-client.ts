/**
 * Modular API service layer.
 *
 * Every data call in the app can go through these functions. By default they use
 * the built-in backend. If VITE_API_BASE_URL is set (e.g. on Netlify/Vercel), all
 * calls are sent as standard REST requests to your own external backend instead.
 *
 * Expected REST endpoints on a custom backend:
 *   GET    /subjects                     GET  /courses?subjectId=
 *   GET    /courses/:id                  GET  /courses/:id/units
 *   GET    /units/:id/sections           GET  /quizzes/:id
 *   POST   /quizzes/:id/attempts         GET  /profiles/me
 *   POST   /auth/login                   POST /auth/signup
 *   POST   /auth/logout
 */
import { supabase } from "@/integrations/supabase/client";

const BASE_URL = (import.meta.env["VITE_API_BASE_URL"] as string | undefined)?.replace(/\/$/, "") || "";
export const usingCustomApi = BASE_URL.length > 0;

const TOKEN_KEY = "mfp-api-token";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

function unwrap<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

/* ---------- Courses ---------- */
export const coursesApi = {
  async listSubjects() {
    if (usingCustomApi) return request<unknown[]>("/subjects");
    return unwrap(await supabase.from("subjects").select("*").order("sort_order"));
  },
  async listCourses(subjectId?: string) {
    if (usingCustomApi) return request<unknown[]>(`/courses${subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : ""}`);
    const q = supabase.from("courses").select("*");
    return unwrap(await (subjectId ? q.eq("subject_id", subjectId) : q));
  },
  async getCourse(id: string) {
    if (usingCustomApi) return request<unknown>(`/courses/${id}`);
    return unwrap(await supabase.from("courses").select("*").eq("id", id).maybeSingle());
  },
  async listUnits(courseId: string) {
    if (usingCustomApi) return request<unknown[]>(`/courses/${courseId}/units`);
    return unwrap(await supabase.from("course_units").select("*").eq("course_id", courseId).order("sort_order"));
  },
  async listSections(unitId: string) {
    if (usingCustomApi) return request<unknown[]>(`/units/${unitId}/sections`);
    return unwrap(await supabase.from("course_sections").select("*").eq("unit_id", unitId).order("sort_order"));
  },
};

/* ---------- Quizzes ---------- */
export const quizzesApi = {
  async getQuiz(id: string) {
    if (usingCustomApi) return request<unknown>(`/quizzes/${id}`);
    return unwrap(await supabase.from("quizzes").select("*").eq("id", id).maybeSingle());
  },
  async submitAttempt(quizId: string, answers: Record<string, unknown>) {
    if (usingCustomApi) return request<unknown>(`/quizzes/${quizId}/attempts`, { method: "POST", body: JSON.stringify({ answers }) });
    throw new Error("Use the built-in exam grading on the default backend.");
  },
};

/* ---------- Auth & profile ---------- */
export const authApi = {
  async login(email: string, password: string) {
    if (usingCustomApi) {
      const r = await request<{ token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      localStorage.setItem(TOKEN_KEY, r.token);
      return r;
    }
    const r = await supabase.auth.signInWithPassword({ email, password });
    if (r.error) throw new Error(r.error.message);
    return r.data;
  },
  async signup(input: { email: string; password: string; username: string; firstName?: string; lastName?: string }) {
    if (usingCustomApi) return request<unknown>("/auth/signup", { method: "POST", body: JSON.stringify(input) });
    return unwrap(await supabase.auth.signUp({
      email: input.email, password: input.password,
      options: { data: { username: input.username, first_name: input.firstName, last_name: input.lastName } },
    }));
  },
  async logout() {
    if (usingCustomApi) {
      await request("/auth/logout", { method: "POST" }).catch(() => undefined);
      localStorage.removeItem(TOKEN_KEY);
      return;
    }
    await supabase.auth.signOut();
  },
  async me() {
    if (usingCustomApi) return request<unknown>("/profiles/me");
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    return unwrap(await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle());
  },
};

export const api = { courses: coursesApi, quizzes: quizzesApi, auth: authApi };
