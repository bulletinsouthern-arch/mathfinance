import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const examRecovery = createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
.inputValidator(d=>z.object({quizId:z.string().uuid(),reason:z.string().trim().min(5).max(1000).optional()}).parse(d))
.handler(async ({context,data})=>{
  const {getDatabase}=await import('@netlify/database'); const db=getDatabase();
  const [attempt]=await db.sql`SELECT id,review_status FROM assessment_sessions WHERE user_id=${context.userId} AND quiz_id=${data.quizId} AND result IS NULL AND resume_allowed=false ORDER BY started_at DESC LIMIT 1`;
  if (!attempt) return null;
  if(data.reason) await db.sql`INSERT INTO assessment_appeals(session_id,user_id,reason) VALUES(${attempt['id']},${context.userId},${data.reason}) ON CONFLICT DO NOTHING`;
  const [appeal]=await db.sql`SELECT status,note FROM assessment_appeals WHERE session_id=${attempt['id']} ORDER BY created_at DESC LIMIT 1`;
  return {status:appeal ? String(appeal['status']) : 'none',note:appeal?.['note'] ? String(appeal['note']) : ''};
});
export const saveExamProgress = createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
.inputValidator(d=>z.object({attemptId:z.string().uuid(),answers:z.record(z.string(),z.string().max(8000)),remaining:z.number().int().min(0)}).parse(d))
.handler(async ({context,data})=>{
 const {getDatabase}=await import('@netlify/database');
 await getDatabase().sql`UPDATE assessment_sessions SET saved_answers=${JSON.stringify(data.answers)}::jsonb,remaining_seconds=${data.remaining} WHERE id=${data.attemptId} AND user_id=${context.userId} AND result IS NULL AND review_status<>'suspended' AND resume_allowed=false`;
 return {ok:true};
});
export const suspensionAppeals = createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
.handler(async ({context})=>{
 const {requireProctor}=await import('./proctor.server'); await requireProctor(context);
 const {getDatabase}=await import('@netlify/database');
 const rows=await getDatabase().sql`SELECT a.*,p.first_name,p.last_name FROM assessment_appeals a LEFT JOIN assessment_people p ON p.user_id=a.user_id ORDER BY (a.status='pending') DESC,a.created_at DESC LIMIT 200`;
 return rows.map(r=>({id:String(r['id']),attemptId:String(r['session_id']),name:[r['first_name'],r['last_name']].filter(Boolean).join(' ') || 'Student',reason:String(r['reason']),status:String(r['status'])}));
});
export const decideSuspensionAppeal = createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
.inputValidator(d=>z.object({attemptId:z.string().uuid(),approve:z.boolean(),note:z.string().trim().min(1).max(500)}).parse(d))
.handler(async ({context,data})=>{
 const {requireProctor}=await import('./proctor.server'); await requireProctor(context);
 const {getDatabase}=await import('@netlify/database'); const db=getDatabase();
 const rows=await db.sql`WITH reviewed AS (
 UPDATE assessment_sessions SET resume_allowed=(${data.approve} AND result IS NULL),review_status=CASE WHEN ${data.approve} THEN 'dismissed' ELSE review_status END,reviewed_by=${context.userId},reviewed_at=now(),warning_count=CASE WHEN ${data.approve} THEN 0 ELSE warning_count END,
 warning_events=warning_events || jsonb_build_array(jsonb_build_object('number',0,'reason',${data.note}::text,'at',now(),'action',${data.approve ? 'unsuspend' : 'appeal_rejected'}::text))
 WHERE id=${data.attemptId} AND resume_allowed=false AND (EXISTS (SELECT 1 FROM assessment_suspensions b WHERE b.user_id=assessment_sessions.user_id AND b.until>now()) OR EXISTS (SELECT 1 FROM assessment_appeals a WHERE a.session_id=assessment_sessions.id AND a.status='pending')) RETURNING id,user_id
 ), lifted AS (
 UPDATE assessment_suspensions b SET until=now() FROM reviewed r WHERE ${data.approve} AND b.user_id=r.user_id AND b.until>now() RETURNING b.id
 ), reset AS (
 UPDATE exam_live_rooms l SET suspended_at=NULL,removed_at=NULL,away_since=NULL,vision_away_since=NULL,closed=true FROM reviewed r WHERE ${data.approve} AND l.user_id=r.user_id RETURNING l.session_id
 ), decided AS (
 UPDATE assessment_appeals a SET status=${data.approve ? 'accepted' : 'rejected'},note=${data.note},decided_by=${context.userId},decided_at=now() FROM reviewed r WHERE a.session_id=r.id AND a.status='pending' RETURNING a.id
 ) SELECT id FROM reviewed`;
 if(!rows.length) throw new Error('No active suspension or pending appeal is available. Refresh the dashboard.');
 return {ok:true};
});
