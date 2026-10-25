import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings } from "@/lib/settings";
import { catIcon } from "@/components/category-icons";

/** Resolves a private media path (or a full https URL) to a viewable link. */
export function useMediaUrl(path: string | undefined) {
  return useQuery({
    queryKey: ["media-url", path],
    enabled: !!path,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      if (!path) return null;
      if (/^https?:\/\//.test(path)) return path;
      return (await supabase.storage.from("media").createSignedUrl(path, 60 * 60 * 24)).data?.signedUrl ?? null;
    },
  }).data;
}

export function SignedImage({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const url = useMediaUrl(path);
  if (!url) return <span className={`block animate-pulse rounded bg-muted ${className ?? ""}`} style={{ minHeight: 80 }} />;
  return <img src={url} alt={alt} loading="lazy" className={className} />;
}

/** Category logo: admin-uploaded image (site setting cat_logo_<id>) or the default icon. */
export function CatLogo({ cat, className }: { cat: number; className?: string }) {
  const s = useSiteSettings();
  const path = s[`cat_logo_${cat}`];
  const url = useMediaUrl(path || undefined);
  if (path && url) return <img src={url} alt="" className={`${className ?? ""} object-contain`} />;
  const Icon = catIcon(cat);
  return <Icon className={className} />;
}
