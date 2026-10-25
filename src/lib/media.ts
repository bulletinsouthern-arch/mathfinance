import { supabase } from "@/integrations/supabase/client";

export type MediaPost = { id: string; title: string; caption: string; media_url: string; media_type: string; show_in_gallery: boolean; created_at: string; url?: string | undefined };

// Media files live in a private bucket; signed links let visitors view them.
export async function fetchMedia(galleryOnly = false): Promise<MediaPost[]> {
  let q = supabase.from("media_posts").select("*").order("created_at", { ascending: false });
  if (galleryOnly) q = q.eq("show_in_gallery", true);
  const { data } = await q;
  const rows = data ?? [];
  if (!rows.length) return [];
  const { data: signed } = await supabase.storage.from("media").createSignedUrls(rows.map((r) => r.media_url), 60 * 60 * 24);
  return rows.map((r, i) => ({ ...r, url: signed?.[i]?.signedUrl ?? undefined }));
}
