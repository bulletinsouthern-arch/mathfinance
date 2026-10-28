import {beforeEach,expect,it,vi} from 'vitest';
const {sql}=vi.hoisted(()=>({sql:vi.fn()}));
vi.mock('@netlify/database',()=>({getDatabase:()=>({sql})}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{
  const chain:any={middleware:()=>chain,inputValidator:()=>chain,handler:(fn:Function)=>fn};return chain;
}}));
import {recordWarning,listIntegrityReviews,decideIntegrityReview} from '@/lib/integrity.server';
import {assessmentAccess} from '@/lib/assessment.functions';
vi.mock('@/lib/assessment-access.server',()=>({assessmentState:vi.fn().mockResolvedValue({enabled:true,eligible:true,grantId:null})}));
const context=(allowed=true,error:any=null)=>({userId:'admin',supabase:{rpc:vi.fn().mockResolvedValue({data:allowed,error})}});
beforeEach(()=>{sql.mockReset();});
it('persists sequential warning events only for the authenticated unfinished attempt',async()=>{
  sql.mockResolvedValue([{warning_count:1}]);
  expect(await recordWarning('student',{attemptId:'attempt',number:1,reason:'Blocked paste'})).toEqual({count:1});
  const [query,...params]=sql.mock.calls[0]!;
  const text=query.join('');
  expect(text).toContain('user_id=');expect(text).toContain('result IS NULL');expect(text).toContain('warning_count=');
  expect(params).toContain('student');expect(params).toContain(0);
});
it('makes warning retries idempotent',async()=>{
  sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{warning_count:2}]);
  expect(await recordWarning('student',{attemptId:'attempt',number:2,reason:'Blocked copy'})).toEqual({count:2});
});
it.each([{rows:[]},{rows:[{warning_count:0}]}])('rejects missing, foreign, or out-of-order warning updates',async({rows})=>{
  sql.mockResolvedValueOnce([]).mockResolvedValueOnce(rows);
  await expect(recordWarning('student',{attemptId:'attempt',number:2,reason:'Blocked copy'})).rejects.toThrow('Could not save warning');
});
it.each([{allowed:false,error:null},{allowed:true,error:{message:'unavailable'}}])('protects review reads and writes before database access',async({allowed,error})=>{
  await expect(listIntegrityReviews(context(allowed,error))).rejects.toThrow('Forbidden');
  await expect(decideIntegrityReview(context(allowed,error),{attemptId:'attempt',action:'suspend',amount:2,unit:'weeks',reason:'Reviewed'})).rejects.toThrow('Forbidden');
  expect(sql).not.toHaveBeenCalled();
});
it('applies an account-wide suspension and closes a pending three-warning review atomically',async()=>{
  sql.mockResolvedValue([{id:'attempt'}]);
  await decideIntegrityReview(context(),{attemptId:'attempt',action:'suspend',amount:2,unit:'months',reason:'Reviewed with student'});
  expect(sql).toHaveBeenCalledTimes(1);
  const [query,...params]=sql.mock.calls[0]!;
  expect(query.join('')).toContain("warning_count=3 AND review_status='pending'");
  expect(query.join('')).toContain('INSERT INTO assessment_suspensions');
  expect(params).toContain('2 months');expect(params).toContain('suspended');
});
it('prevents repeat suspension after a completed review',async()=>{
  sql.mockResolvedValue([]);
  await expect(decideIntegrityReview(context(),{attemptId:'attempt',action:'suspend',amount:1,unit:'days',reason:'Reviewed'})).rejects.toThrow('already decided');
});
it('blocks new attempts for a suspended account before creating a session, including other exams',async()=>{
  sql.mockResolvedValue([{id:'suspension'}]);
  const invoke=assessmentAccess as unknown as (args:object)=>Promise<unknown>;
  await expect(invoke({context:context(),data:{quizId:'another-exam',begin:true}})).rejects.toThrow('suspended');
  expect(sql).toHaveBeenCalledTimes(1);
  expect(sql.mock.calls[0]![0].join('')).toContain('until>now()');
});
it('fails closed if suspension status cannot be checked',async()=>{
  sql.mockRejectedValue(new Error('database unavailable'));
  const invoke=assessmentAccess as unknown as (args:object)=>Promise<unknown>;
  await expect(invoke({context:context(),data:{quizId:'another-exam',begin:true}})).rejects.toThrow();
  expect(sql).toHaveBeenCalledTimes(1);
});
