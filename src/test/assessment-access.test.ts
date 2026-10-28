import {beforeEach,expect,it,vi} from 'vitest';
const {sql}=vi.hoisted(()=>({sql:vi.fn()}));
vi.mock('@netlify/database',()=>({getDatabase:()=>({sql})}));
import {assessmentState} from '@/lib/assessment-access.server';
function context(legacy:any[]=[], grants:any[]=[], error:any=null) {
  return {userId:'user',supabase:{from:(table:string)=>{
    const chain:any={};
    for(const name of ['select','eq','order','limit']) chain[name]=()=>chain;
    chain.then=(resolve:any)=>Promise.resolve({data:table==='quiz_attempts'?legacy:grants,error}).then(resolve);
    return chain;
  }}};
}
beforeEach(()=>sql.mockReset());
it('allows a first attempt and defaults visibility to on',async()=>{
  sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  expect(await assessmentState(context(),'quiz')).toEqual({enabled:true,eligible:true,grantId:null});
});
it('blocks an interrupted attempt after a restart even without a result',async()=>{
  sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{id:'started',grant_id:null}]).mockResolvedValueOnce([]);
  expect((await assessmentState(context(),'quiz')).eligible).toBe(false);
});
it('blocks historical completed attempts, including passed exams',async()=>{
  sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  expect((await assessmentState(context([{id:'legacy',created_at:'2026-10-28'}]),'quiz')).eligible).toBe(false);
});
it('allows one unused approval and consumes it when an attempt starts',async()=>{
  sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{grant_id:null}]).mockResolvedValueOnce([{id:'approval'}]);
  expect((await assessmentState(context(),'quiz')).grantId).toBe('approval');
  sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{grant_id:null},{grant_id:'approval'}]).mockResolvedValueOnce([{id:'approval'}]);
  expect((await assessmentState(context(),'quiz')).eligible).toBe(false);
});
it('keeps disabled assessments disabled even with an approved retake',async()=>{
  sql.mockResolvedValueOnce([{enabled:false}]).mockResolvedValueOnce([{grant_id:null}]).mockResolvedValueOnce([{id:'approval'}]);
  expect((await assessmentState(context(),'quiz')).enabled).toBe(false);
});
it('fails closed if historical attempt verification fails',async()=>{
  sql.mockResolvedValue([]);
  await expect(assessmentState(context([],[],{}),'quiz')).rejects.toThrow('Could not verify');
});
