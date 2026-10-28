import { getDatabase } from '@netlify/database';

export async function assessmentState(context: { supabase: any; userId: string }, quizId: string) {
  const db = getDatabase();
  const [visibility, sessions, grants, legacy, legacyGrants] = await Promise.all([
    db.sql`SELECT enabled FROM assessment_visibility WHERE quiz_id=${quizId}`,
    db.sql`SELECT id,grant_id,started_at FROM assessment_sessions WHERE user_id=${context.userId} AND quiz_id=${quizId} ORDER BY started_at DESC`,
    db.sql`SELECT id FROM assessment_retakes WHERE user_id=${context.userId} AND quiz_id=${quizId} AND status='accepted' ORDER BY decided_at DESC`,
    context.supabase.from('quiz_attempts').select('id,created_at').eq('user_id',context.userId).eq('quiz_id',quizId).order('created_at',{ascending:false}).limit(1),
    context.supabase.from('retake_requests').select('id,decided_at').eq('user_id',context.userId).eq('quiz_id',quizId).eq('status','accepted').order('decided_at',{ascending:false}).limit(1),
  ]);
  if (legacy.error || legacyGrants.error) throw new Error('Could not verify previous attempts. Please retry.');
  const used = new Set(sessions.map(s => s['grant_id']));
  const grant = grants.find(g => !used.has(g['id']))?.['id'] ?? legacyGrants.data?.find((g: any) => !used.has(g.id) && (!legacy.data?.[0] || new Date(g.decided_at) > new Date(legacy.data[0].created_at)))?.id ?? null;
  return { enabled: visibility[0]?.['enabled'] !== false, eligible: (!sessions.length && !legacy.data?.length) || !!grant, grantId: grant as string | null };
}
