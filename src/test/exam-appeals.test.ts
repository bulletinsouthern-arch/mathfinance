vi.mock("@/lib/course-access.server",()=>({assertQuizCourseAccess:vi.fn().mockResolvedValue(undefined)}));
import {beforeEach,expect,it,vi} from 'vitest';
const {sql}=vi.hoisted(()=>({sql:vi.fn()}));
vi.mock('@netlify/database',()=>({getDatabase:()=>({sql})}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{
 const chain:any={middleware:()=>chain,inputValidator:()=>chain,handler:(fn:Function)=>fn};return chain;
}}));
vi.mock('@/lib/assessment-access.server',()=>({assessmentState:vi.fn().mockResolvedValue({enabled:true,eligible:false,grantId:null})}));
import {assessmentAccess} from '@/lib/assessment.functions';
import {examRecovery,saveExamProgress,decideSuspensionAppeal,suspensionAppeals} from '@/lib/exam-appeals.functions';
const context=(allowed=true)=>({userId:'student',supabase:{rpc:vi.fn().mockResolvedValue({data:allowed})}});
const invoke=(fn:unknown,args:object)=>(fn as (args:object)=>Promise<any>)(args);
beforeEach(()=>sql.mockReset().mockResolvedValue([]));
it('rejects nonadministrators before reading appeals or restoring attempts',async()=>{
 await expect(invoke(suspensionAppeals,{context:context(false)})).rejects.toThrow('Forbidden');
 await expect(invoke(decideSuspensionAppeal,{context:context(false),data:{attemptId:'other',approve:true,note:'Approved'}})).rejects.toThrow('Forbidden');
 expect(sql).not.toHaveBeenCalled();
});
it('stores an appeal only for the authenticated unfinished attempt, without granting a retake',async()=>{
 sql.mockResolvedValueOnce([{id:'attempt'}]).mockResolvedValueOnce([]).mockResolvedValueOnce([{status:'pending'}]);
 const result=await invoke(examRecovery,{context:context(),data:{quizId:'quiz',reason:'Power outage at 10 AM'}});
 expect(result.status).toBe('pending');
 expect(sql.mock.calls[0]![0].join('')).toContain('result IS NULL');
 expect(sql.mock.calls[0]).toContain('student');
 expect(sql.mock.calls[1]![0].join('')).toContain('ON CONFLICT DO NOTHING');
 expect(sql.mock.calls.some(c=>c[0].join('').includes('assessment_retakes'))).toBe(false);
});
it('restores access and the same unfinished attempt atomically while keeping completed results intact',async()=>{
 sql.mockResolvedValue([{id:'attempt'}]);
 await invoke(decideSuspensionAppeal,{context:context(),data:{attemptId:'attempt',approve:true,note:'Confirmed outage'}});
 const query=sql.mock.calls[0]![0].join('');
 expect(query).toContain('AND result IS NULL');
 expect(query).toContain('UPDATE assessment_suspensions');
 expect(query).toContain('UPDATE exam_live_rooms');
 expect(query).toContain('UPDATE assessment_appeals');
 expect(query).toContain('resume_allowed=false');
 expect(query).not.toContain('result=NULL');
 expect(query).not.toContain('assessment_retakes');
 expect(sql).toHaveBeenCalledTimes(1);
});
it('saves progress only within the students own active unfinished attempt',async()=>{
 await invoke(saveExamProgress,{context:context(),data:{attemptId:'attempt',answers:{q:'b'},remaining:72}});
 const [query,...params]=sql.mock.calls[0]!;
 expect(query.join('')).toContain("review_status<>'suspended'");
 expect(query.join('')).toContain('result IS NULL');
 expect(query.join('')).toContain('resume_allowed=false');
 expect(params).toContain('student');expect(params).toContain(72);
});

it.each([true,false])('types audit text parameters for PostgreSQL when approving=%s',async(approve)=>{
 sql.mockResolvedValue([{id:'attempt'}]);
 const note="Reviewed student's outage";
 await invoke(decideSuspensionAppeal,{context:context(),data:{attemptId:'attempt',approve,note}});
 const [parts,...params]=sql.mock.calls[0]!;
 // jsonb_build_object accepts any type, so PostgreSQL cannot infer these
 // parameter types unless the query supplies explicit casts.
 const audit=parts.join('?').match(/jsonb_build_object\('number',0,'reason',\?::text,'at',now\(\),'action',\?::text\)/);
 expect(audit).not.toBeNull();
 expect(params).toContain(note);
 expect(params).toContain(approve?'unsuspend':'appeal_rejected');
});

it('reports stale decisions without granting a resume',async()=>{
 await expect(invoke(decideSuspensionAppeal,{context:context(),data:{attemptId:'attempt',approve:true,note:'Reviewed'}})).rejects.toThrow('No active suspension or pending appeal');
 expect(sql).toHaveBeenCalledTimes(1);
});

it('resumes the approved original attempt with saved answers and remaining time without inserting another attempt',async()=>{
 sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{id:'original'}]).mockResolvedValueOnce([{first_name:'Maria',last_name:'Santos'}]).mockResolvedValueOnce([{id:'original',saved_answers:{q:'b'},remaining_seconds:72}]);
 const query:any={select:()=>query,eq:()=>query,gt:()=>query,maybeSingle:async()=>({data:{id:'quiz'}}),limit:async()=>({data:[]})};
 const ctx={userId:'student',supabase:{from:()=>query}};
 const result=await invoke(assessmentAccess,{context:ctx,data:{quizId:'quiz',begin:true}});
 expect(result).toMatchObject({id:'original',answers:{q:'b'},remaining:72});
 expect(sql.mock.calls.some(c=>c[0].join('').includes('INSERT INTO assessment_sessions'))).toBe(false);
 expect(sql.mock.calls[3]![0].join('')).toContain('resume_allowed=true');
});
