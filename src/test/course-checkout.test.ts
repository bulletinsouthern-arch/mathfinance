import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const {sql,from}=vi.hoisted(()=>({sql:vi.fn(),from:vi.fn()}));
vi.mock('@netlify/database',()=>({getDatabase:()=>({sql})}));
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{from}}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
vi.mock('@tanstack/react-start/server',()=>({getRequest:()=>new Request('https://example.test/checkout')}));
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{let parse=(d:any)=>d;const c:any={middleware:()=>c,inputValidator:(v:any)=>{parse=v;return c;},handler:(h:any)=>(a:any)=>h({...a,data:parse(a.data)})};return c;}}));
import {createCourseCheckout,paymentGatewayStatus} from '@/lib/paymongo.functions';
const courseId='00000000-0000-4000-8000-000000000001';
function setup(enabled=true,protectionReady=true){
 from.mockImplementation((table:string)=>{const q:any={select:()=>q,eq:()=>q,limit:async()=>({error:protectionReady?null:{message:'not migrated'}}),maybeSingle:async()=>({data:table==='courses'?{id:courseId,subject_id:'subject',title:'Course',price:0}:table==='payment_settings'?{enabled,secret_key:'test-placeholder'}:null})};return q;});
 sql.mockResolvedValueOnce([{monthly:250,yearly:2400}]).mockResolvedValueOnce([{id:'receipt'}]).mockResolvedValue([]);
}
beforeEach(()=>{sql.mockReset();from.mockReset();});
afterEach(()=>vi.unstubAllGlobals());
it('charges the full yearly price up front using server-side pricing',async()=>{
 setup();const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({data:{id:'checkout',attributes:{checkout_url:'https://pay.example.test'}}})});vi.stubGlobal('fetch',fetcher);
 const result=await (createCourseCheckout as any)({data:{courseId,plan:'yearly'},context:{userId:'student'}});
 expect(result.ok).toBe(true);
 const body=JSON.parse(fetcher.mock.calls[0]![1].body);
 expect(body.data.attributes.line_items[0].amount).toBe(240000);
 expect(body.data.attributes.reference_number).toBe(`student:${courseId}:receipt`);
});
it('keeps paid courses unavailable when PayMongo is not configured',async()=>{
 setup(false);const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const result=await (createCourseCheckout as any)({data:{courseId,plan:'monthly'},context:{userId:'student'}});
 expect(result).toMatchObject({ok:false,error:'Payment gateway access unavailable. PayMongo has not been set up yet.'});expect(fetcher).not.toHaveBeenCalled();
});
it('does not collect a payment before the protection migration is ready',async()=>{
 setup(true,false);const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const result=await (createCourseCheckout as any)({data:{courseId,plan:'yearly'},context:{userId:'student'}});
 expect(result).toMatchObject({ok:false,error:'Payment gateway access unavailable. Please try again later.'});expect(fetcher).not.toHaveBeenCalled();
});

it('returns only gateway availability without exposing credentials',async()=>{
 setup(true);
 expect(await (paymentGatewayStatus as any)({context:{}})).toEqual({available:true});
});
it('reports an unconfigured gateway as unavailable',async()=>{
 setup(false);
 expect(await (paymentGatewayStatus as any)({context:{}})).toEqual({available:false});
});
