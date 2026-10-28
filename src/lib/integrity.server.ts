import { getDatabase } from '@netlify/database';
type Context = {userId:string;supabase:any};
async function admin(context:Context) {
  const {data,error}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});
  if(error || !data) throw new Error('Forbidden');
}
export async function recordWarning(userId:string,data:{attemptId:string;number:number;reason:string}) {
  const db=getDatabase();
  const event=JSON.stringify([{number:data.number,reason:data.reason}]);
  const rows=await db.sql`UPDATE assessment_sessions SET warning_count=${data.number}, warning_events=warning_events || jsonb_build_array((${event}::jsonb->0) || jsonb_build_object('at',now()))
    WHERE id=${data.attemptId} AND user_id=${userId} AND result IS NULL AND warning_count=${data.number-1} RETURNING warning_count`;
  if(rows.length) return {count:Number(rows[0]!['warning_count'])};
  const existing=await db.sql`SELECT warning_count FROM assessment_sessions WHERE id=${data.attemptId} AND user_id=${userId}`;
  if(!existing.length || Number(existing[0]!['warning_count'])<data.number) throw new Error('Could not save warning. Retry submission.');
  return {count:Number(existing[0]!['warning_count'])};
}
export async function listIntegrityReviews(context:Context) {
  await admin(context);
  const rows=await getDatabase().sql`SELECT s.id,s.quiz_id,s.started_at,s.warning_events,s.review_status,
    p.first_name,p.last_name,b.until
    FROM assessment_sessions s LEFT JOIN assessment_people p ON p.user_id=s.user_id
    LEFT JOIN LATERAL (SELECT until FROM assessment_suspensions WHERE user_id=s.user_id AND until>now() ORDER BY until DESC LIMIT 1) b ON true
    WHERE s.warning_count=3 ORDER BY (s.review_status='pending') DESC,s.started_at DESC LIMIT 200`;
  return rows.map(r=>({id:String(r['id']),quizId:String(r['quiz_id']),startedAt:String(r['started_at']),name:[r['first_name'],r['last_name']].filter(Boolean).join(' ') || 'Student',events:r['warning_events'] as {number:number;reason:string}[],status:String(r['review_status']),until:r['until'] ? String(r['until']):null}));
}
export async function decideIntegrityReview(context:Context,data:{attemptId:string;action:'dismiss'|'suspend';amount:number;unit:'days'|'weeks'|'months';reason:string}) {
  await admin(context);
  const db=getDatabase();
  // One statement makes a review and its account-wide suspension atomic and retry-safe.
  const status=data.action==='suspend'?'suspended':'dismissed';
  const interval=`${data.amount} ${data.unit}`;
  const rows=await db.sql`WITH reviewed AS (
    UPDATE assessment_sessions SET review_status=${status},reviewed_by=${context.userId},reviewed_at=now()
    WHERE id=${data.attemptId} AND warning_count=3 AND review_status='pending' RETURNING id,user_id
  ), suspended AS (
    INSERT INTO assessment_suspensions(user_id,session_id,reason,until,created_by)
    SELECT user_id,id,${data.reason},now()+${interval}::interval,${context.userId}::uuid FROM reviewed WHERE ${data.action}='suspend' RETURNING id
  ) SELECT id FROM reviewed`;
  if(!rows.length) throw new Error('This review was already decided or is unavailable. Refresh the list.');
  return {ok:true};
}
