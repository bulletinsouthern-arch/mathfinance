import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useSiteSettings } from "@/lib/settings";
import { useMediaUrl } from "@/components/SignedImage";

/** Keep the browser icon in sync with admin settings across navigation. */
export function SiteBranding() {
  const settings = useSiteSettings();
  const iconUrl = useMediaUrl(settings["site_favicon"]);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.href = iconUrl || "/favicon.ico";
    icon.dataset["siteBranding"] = "true";
    // A dedicated link takes precedence over the static fallback managed by the router.
    document.head.appendChild(icon);
    return () => icon.remove();
  }, [iconUrl, pathname]);

  return null;
}
