import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const assessmentAccess = createServerFn({method:'POST'})
  .middleware([requireSupabaseAuth])
  .inputValidator(d => z.object({quizId:z.string().uuid(), begin:z.boolean().default(false)}).parse(d))
  .handler(async ({data,context}) => {
    const { assessmentState } = await import('./assessment-access.server');
    const state = await assessmentState(context,data.quizId);
    if (!data.begin) return {enabled:state.enabled,eligible:state.eligible,id:null as string|null};
    if (!state.enabled) throw new Error('This assessment is turned off.');
    if (!state.eligible) throw new Error('You already finished or started this assessment. Request a retake and wait for administrator approval.');
    const {data:quiz,error} = await context.supabase.from('quizzes').select('id').eq('id',data.quizId).maybeSingle();
    if (error || !quiz) throw new Error('Assessment unavailable.');
    const {data:bans,error:banError}=await context.supabase.from('exam_bans').select('id').eq('user_id',context.userId).gt('until',new Date().toISOString()).limit(1);
    if (banError || bans?.length) throw new Error('Assessment access is suspended or could not be verified.');
    const {getDatabase} = await import('@netlify/database');
    const rows = await getDatabase().sql`INSERT INTO assessment_sessions(user_id,quiz_id,grant_id,email) VALUES (${context.userId},${data.quizId},${state.grantId},${String(context.claims.email ?? '')}) ON CONFLICT DO NOTHING RETURNING id`;
    if (!rows.length) throw new Error('This attempt was already started. Request a retake.');
    return {enabled:true,eligible:true,id:String(rows[0]!['id'])};
  });

export const assessmentVisibility = createServerFn({method:'POST'})
  .middleware([requireSupabaseAuth])
  .inputValidator(d => z.object({quizId:z.string().uuid().optional(),enabled:z.boolean().optional()}).parse(d))
  .handler(async ({data,context}) => {
    const {getDatabase} = await import('@netlify/database');
    const db = getDatabase();
    if (data.quizId && data.enabled !== undefined) {
      const {data:admin,error} = await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});
      if (error || !admin) throw new Error('Forbidden');
      await db.sql`INSERT INTO assessment_visibility(quiz_id,enabled) VALUES (${data.quizId},${data.enabled}) ON CONFLICT(quiz_id) DO UPDATE SET enabled=EXCLUDED.enabled`;
    }
    const rows = await db.sql`SELECT quiz_id,enabled FROM assessment_visibility`;
    return Object.fromEntries(rows.map(r=>[String(r['quiz_id']),Boolean(r['enabled'])])) as Record<string,boolean>;
  });

export const requestAssessmentRetake = createServerFn({method:'POST'})
  .middleware([requireSupabaseAuth])
  .inputValidator(d => z.object({quizId:z.string().uuid(),message:z.string().max(500).optional()}).parse(d))
  .handler(async ({data,context}) => {
    const {getDatabase} = await import('@netlify/database');
    const db=getDatabase();
    if (data.message !== undefined) {
      const {assessmentState}=await import('./assessment-access.server');
      const state=await assessmentState(context,data.quizId);
      if (state.eligible) throw new Error('You already have permission to take this assessment.');
      await db.sql`INSERT INTO assessment_retakes(user_id,quiz_id,message,email) VALUES (${context.userId},${data.quizId},${data.message},${String(context.claims.email ?? "")}) ON CONFLICT DO NOTHING`;
    }
    const rows=await db.sql`SELECT id,status,created_at FROM assessment_retakes WHERE user_id=${context.userId} AND quiz_id=${data.quizId} ORDER BY created_at DESC LIMIT 1`;
    return rows[0] ? {id:String(rows[0]['id']),status:String(rows[0]['status'])} : null;
  });

// Visibility is public course metadata; changing it still requires an admin session.
export const getAssessmentVisibility = createServerFn({method:'GET'})
  .handler(async () => {
    const {getDatabase}=await import('@netlify/database');
    const rows=await getDatabase().sql`SELECT quiz_id,enabled FROM assessment_visibility`;
    return Object.fromEntries(rows.map(r=>[String(r['quiz_id']),Boolean(r['enabled'])])) as Record<string,boolean>;
  });
