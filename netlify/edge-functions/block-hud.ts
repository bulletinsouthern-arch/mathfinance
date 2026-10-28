import type { Context, Config } from "@netlify/edge-functions";

export default async (req: Request, context: Context) => {
  return new Response("// HUD disabled", {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
};

export const config: Config = {
  path: "/.netlify/scripts/hud*",
};
