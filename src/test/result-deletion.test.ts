import { beforeEach, expect, it, vi } from 'vitest';
const {sql} = vi.hoisted(()=>({sql:vi.fn()}));
vi.mock('@netlify/database',()=>({getDatabase:()=>({sql})}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{
  const chain:any={middleware:()=>chain,inputValidator:()=>chain,handler:(handler:Function)=>handler};return chain;
}}));
import { deleteResult } from '@/lib/results.functions';
const invoke = deleteResult as unknown as (args:object)=>Promise<unknown>;
beforeEach(()=>{sql.mockReset();sql.mockResolvedValue([]);});
it.each([{data:false,error:null},{data:true,error:{message:'failed'}}])('rejects unauthorized or failed administrator checks before writing',async result=>{
  const context={userId:'u',supabase:{rpc:vi.fn().mockResolvedValue(result)}};
  await expect(invoke({context,data:{id:'record',table:'quiz_attempts'}})).rejects.toThrow('Forbidden');
  expect(sql).not.toHaveBeenCalled();
});
it('records dashboard deletion without removing attempt or approval history',async()=>{
  const context={userId:'admin',supabase:{rpc:vi.fn().mockResolvedValue({data:true,error:null})}};
  await invoke({context,data:{id:'record',table:'retake_requests'}});
  const [query,...values]=sql.mock.calls[0]!;
  expect(query.join('')).toContain('INSERT INTO assessment_dashboard_deletions');
  expect(values).toEqual(['record','retake_requests','admin']);
});
