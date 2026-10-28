import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const studentProfile = createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(d=>z.object({firstName:z.string().trim().min(1).max(100),lastName:z.string().trim().min(1).max(100)}).optional().parse(d))
 .handler(async({data,context})=>{
  const {getDatabase}=await import('@netlify/database');
  const db=getDatabase();
  const email=z.string().email().parse(context.claims.email);
  if(data) {
   await db.sql`INSERT INTO assessment_people(user_id,first_name,last_name,email) VALUES (${context.userId},${data.firstName},${data.lastName},${email}) ON CONFLICT(user_id) DO UPDATE SET first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,email=EXCLUDED.email,updated_at=now()`;
  }
  await db.sql`UPDATE assessment_people SET email=${email} WHERE user_id=${context.userId}`;
  const rows=await db.sql`SELECT first_name,last_name FROM assessment_people WHERE user_id=${context.userId}`;
  return rows[0] ? {firstName:String(rows[0]['first_name']),lastName:String(rows[0]['last_name'])} : null;
 });
export const assessmentPrograms = createServerFn({method:'POST'})
 .middleware([requireSupabaseAuth])
 .inputValidator(d=>z.object({title:z.string().trim().min(1).max(150)}).optional().parse(d))
 .handler(async({data,context})=>{
  const {getDatabase}=await import('@netlify/database');
  const db=getDatabase();
  if(data) {
   const {data:allowed,error}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});
   if(error || !allowed) throw new Error('Administrator access required.');
   await db.sql`INSERT INTO assessment_programs(title) VALUES (${data.title}) ON CONFLICT DO NOTHING`;
  }
  const rows=await db.sql`SELECT id,title FROM assessment_programs ORDER BY title`;
  return rows.map(r=>({id:String(r['id']),title:String(r['title'])}));
 });
