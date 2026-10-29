import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Image inference is separate from the admin-configured Ollama conversation.
export const mfpCreateImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    prompt: z.string().trim().min(1).max(4000),
    reference: z.string().max(2_000_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).optional(),
  }).parse(data))
  .handler(async ({ data }) => {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey: process.env["NETLIFY_AI_GATEWAY_KEY"]!,
        httpOptions: { baseUrl: process.env["NETLIFY_AI_GATEWAY_URL"]!.replace(/\/$/, ""), timeout: 50000 },
      });
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{
        text: `Create an image following this brief. Aim for polished professional composition, coherent lighting, accurate detail and high visual quality. When realism is requested, use photorealistic textures and natural proportions. Follow the requested style. Brief: ${data.prompt}`,
      }];
      if (data.reference) {
        const [header, base64] = data.reference.split(",");
        parts.push({ inlineData: { mimeType: header!.slice(5, header!.indexOf(";")), data: base64! } });
      }
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image",
        contents: [{ role: "user", parts }],
        config: { responseModalities: ["TEXT", "IMAGE"] },
      });
      const result = response.candidates?.[0]?.content?.parts ?? [];
      const image = result.find((part) => part.inlineData?.mimeType?.startsWith("image/"))?.inlineData;
      if (!image?.data || image.data.length > 5_000_000 || !/^image\/(png|jpeg|webp)$/.test(image.mimeType ?? "")) {
        return { ok: false as const, error: "No downloadable image was returned. Try a different description or a simpler design." };
      }
      return { ok: true as const, image: `data:${image.mimeType};base64,${image.data}`, reply: result.map((p) => p.text ?? "").join("\n").slice(0, 4000) || "Your image is ready. Download it before leaving this chat; images are not saved in chat history." };
    } catch {
      return { ok: false as const, error: "Image creation is unavailable or took too long. Please try again. Image generation requires available AI credits." };
    }
  });
