import { getDatabase } from "@netlify/database";
import { enforceDepartures } from "../src/lib/exam-departures.server.ts";

// Live polling enforces the ten-second threshold while connected. This sweep
// catches persisted departures after a browser closes and expires signaling.
export default async () => {
  await enforceDepartures();
  await getDatabase()
    .sql`DELETE FROM exam_live_signals WHERE created_at<now()-interval '2 minutes'`;
  return new Response(null, { status: 204 });
};
export const config = { schedule: "* * * * *" };
