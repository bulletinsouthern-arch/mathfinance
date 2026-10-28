import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const recordAssessmentWarning = createServerFn({method:'POST'})
  .middleware([requireSupabaseAuth])
  .inputValidator(d=>z.object({attemptId:z.string().uuid(),number:z.number().int().min(1).max(3),reason:z.string().min(1).max(300)}).parse(d))
  .handler(async ({data,context})=>{
    const {recordWarning}=await import('./integrity.server');
    return recordWarning(context.userId,data);
  });
export const integrityReviews = createServerFn({method:'POST'})
  .middleware([requireSupabaseAuth])
  .handler(async ({context})=>{
    const {listIntegrityReviews}=await import('./integrity.server');
    return listIntegrityReviews(context);
  });
export const reviewIntegrity = createServerFn({method:'POST'})
  .middleware([requireSupabaseAuth])
  .inputValidator(d=>z.object({attemptId:z.string().uuid(),action:z.enum(['dismiss','suspend']),amount:z.number().int().min(1).max(365),unit:z.enum(['days','weeks','months']),reason:z.string().trim().min(1).max(500)}).parse(d))
  .handler(async ({data,context})=>{
    const {decideIntegrityReview}=await import('./integrity.server');
    return decideIntegrityReview(context,data);
  });
export const assessmentSuspension = createServerFn({method:'POST'})
  .middleware([requireSupabaseAuth])
  .handler(async ({context})=>{
    const {getDatabase}=await import('@netlify/database');
    const rows=await getDatabase().sql`SELECT until,reason FROM assessment_suspensions WHERE user_id=${context.userId} AND until>now() ORDER BY until DESC LIMIT 1`;
    return rows[0] ? {until:String(rows[0]['until']),reason:String(rows[0]['reason'])} : null;
  });
