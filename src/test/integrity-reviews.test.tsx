import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const {list,review}=vi.hoisted(()=>({list:vi.fn(),review:vi.fn()}));
vi.mock('@/lib/integrity.functions',()=>({integrityReviews:list,reviewIntegrity:review}));
import {IntegrityReviews} from '@/components/admin/IntegrityReviews';
const row={id:'attempt',quizId:'quiz',startedAt:'2026-10-28',name:'Mara Santos',events:[{number:1,reason:'Blocked paste'},{number:2,reason:'Left full screen'},{number:3,reason:'Blocked copy'}],status:'pending',until:null};
function mount(){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><IntegrityReviews /></QueryClientProvider>);}
beforeEach(()=>{list.mockReset().mockResolvedValue([row]);review.mockReset().mockResolvedValue({ok:true});});
afterEach(cleanup);
it('requires a reason and an administrator action before applying a months-long suspension',async()=>{
 mount();
 expect(await screen.findByText('Mara Santos · 3 of 3 warnings')).toBeInTheDocument();
 expect(review).not.toHaveBeenCalled();
 const suspend=screen.getByRole('button',{name:'Suspend after review'});
 expect(suspend).toBeDisabled();
 fireEvent.change(screen.getByLabelText('Review reason for Mara Santos'),{target:{value:'Reviewed with student and proctor'}});
 fireEvent.change(screen.getByLabelText('Suspension duration for Mara Santos'),{target:{value:'2'}});
 fireEvent.change(screen.getByLabelText('Suspension unit for Mara Santos'),{target:{value:'months'}});
 expect(suspend).toBeEnabled();
 list.mockResolvedValue([{...row,status:'suspended',until:'2026-12-28'}]);
 fireEvent.click(suspend);
 await waitFor(()=>expect(review).toHaveBeenCalledWith({data:{attemptId:'attempt',action:'suspend',amount:2,unit:'months',reason:'Reviewed with student and proctor'}}));
 expect(await screen.findByText(/Suspended until/)).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Suspend after review'})).not.toBeInTheDocument();
});
it('allows a human to dismiss warnings without suspending the student',async()=>{
 mount();
 const dismiss=await screen.findByRole('button',{name:'Dismiss warnings'});
 list.mockResolvedValue([{...row,status:'dismissed'}]);
 fireEvent.click(dismiss);
 await waitFor(()=>expect(review).toHaveBeenCalledWith({data:expect.objectContaining({action:'dismiss'})}));
 expect(await screen.findByText(/· dismissed/)).toBeInTheDocument();
});
