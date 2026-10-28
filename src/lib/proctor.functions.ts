import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const id = z.string().uuid();
export const liveExamPoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        attemptId: id.optional(),
        after: z.number().int().nonnegative().default(0),
        focused: z.boolean().optional(),
        fullscreen: z.boolean().optional(),
        mic: z.boolean().optional(),
        answered: z.number().int().min(0).max(10000).optional(),
        total: z.number().int().min(0).max(10000).optional(),
        close: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { pollRoom } = await import("./proctor.server");
    return pollRoom(context, data);
  });
export const liveExamSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        attemptId: id,
        to: id,
        body: z.object({
          type: z.enum(["offer", "answer", "ice", "hangup", "warn", "kick"]),
          connection: z.string().uuid(),
          sdp: z.string().max(30000).optional(),
          ice: z
            .object({
              candidate: z.string().max(3000),
              sdpMid: z.string().nullable().optional(),
              sdpMLineIndex: z.number().nullable().optional(),
              usernameFragment: z.string().nullable().optional(),
            })
            .optional(),
          text: z.string().max(500).optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { signalRoom } = await import("./proctor.server");
    return signalRoom(context, data);
  });
export const liveExamVision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        attemptId: id,
        image: z
          .string()
          .min(50)
          .max(300000)
          .regex(/^[A-Za-z0-9+/=]+$/),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { checkVision } = await import("./proctor.server");
    return checkVision(context, data);
  });

export const liveExamRemove = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        attemptId: id,
        amount: z.number().int().min(0).max(365),
        unit: z.enum(["hours", "days", "weeks"]),
        reason: z.string().trim().min(1).max(500),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { removeStudent } = await import("./proctor.server");
    return removeStudent(context, data);
  });
