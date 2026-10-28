import {beforeEach,expect,it,vi} from 'vitest';
const {sql}=vi.hoisted(()=>({sql:vi.fn()}));
vi.mock('@netlify/database',()=>({getDatabase:()=>({sql})}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{
 let parse=(d:any)=>d;
 const chain:any={middleware:()=>chain,inputValidator:(v:any)=>{parse=v;return chain;},handler:(h:any)=>(args:any)=>h({...args,data:parse(args?.data)})};return chain;
}}));
import {studentProfile,assessmentPrograms} from '@/lib/student.functions';
import {assessmentAccess} from '@/lib/assessment.functions';
vi.mock('@/lib/assessment-access.server',()=>({assessmentState:async()=>({enabled:true,eligible:true,grantId:null})}));
const id='00000000-0000-4000-8000-000000000001';
const context={userId:id,claims:{email:'verified@example.com'},supabase:{rpc:vi.fn()}};
beforeEach(()=>{sql.mockReset();sql.mockResolvedValue([]);context.supabase.rpc.mockReset();});
it('rejects blank names before writing',()=>{
 expect(()=>(studentProfile as any)({data:{firstName:' ',lastName:'Santos',programId:id},context})).toThrow();
 expect(sql).not.toHaveBeenCalled();
});
it('rejects programs not set by an administrator',async()=>{
 await expect((studentProfile as any)({data:{firstName:'Maria',lastName:'Santos',programId:id},context})).rejects.toThrow('Choose a program');
 expect(sql).toHaveBeenCalledTimes(1);
});
it('records the authenticated email rather than a supplied email',async()=>{
 sql.mockResolvedValueOnce([{id}]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{first_name:'Maria',last_name:'Santos',program_id:id}]);
 await (studentProfile as any)({data:{firstName:'Maria',lastName:'Santos',programId:id,email:'forged@example.com'},context});
 expect(sql.mock.calls[1]?.slice(1)).toEqual([id,'Maria','Santos','verified@example.com',id]);
});
it('denies student creation of program categories',async()=>{
 context.supabase.rpc.mockResolvedValue({data:false,error:null});
 await expect((assessmentPrograms as any)({data:{title:'Business Administration'},context})).rejects.toThrow('Administrator access required');
 expect(sql).not.toHaveBeenCalled();
});
it('denies an exam start without completed student details before creating an attempt',async()=>{
 await expect((assessmentAccess as any)({data:{quizId:id,begin:true},context})).rejects.toThrow('Complete your first name');
 expect(sql).toHaveBeenCalledTimes(1);
});
