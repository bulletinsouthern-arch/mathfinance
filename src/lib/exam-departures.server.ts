import { getDatabase } from "@netlify/database";
export async function enforceDepartures(userId?: string) {
  // Lock each eligible room once; the suspension and room transition commit together.
  await getDatabase().sql`WITH overdue AS (
    UPDATE exam_live_rooms SET suspended_at=now()
    WHERE away_since IS NOT NULL AND away_since < now()-interval '10 seconds'
      AND suspended_at IS NULL AND EXISTS (SELECT 1 FROM assessment_sessions s WHERE s.id=exam_live_rooms.session_id AND s.result IS NULL) AND (${userId ?? null}::uuid IS NULL OR user_id=${userId ?? null}::uuid)
    RETURNING session_id,user_id
  ), noted AS (
    UPDATE assessment_sessions s SET review_status='suspended',reviewed_at=now(),warning_events=warning_events || jsonb_build_array(jsonb_build_object('number',-1,'reason','Automatic 14-day suspension: the exam window was left for more than 10 seconds.','at',now()))
    FROM overdue o WHERE s.id=o.session_id RETURNING s.id
  ) INSERT INTO assessment_suspensions(user_id,session_id,reason,until,created_by)
    SELECT user_id,session_id,'Exam window was left for more than 10 seconds (automatic 14-day suspension).',now()+interval '14 days',user_id FROM overdue
    ON CONFLICT DO NOTHING`;
}
