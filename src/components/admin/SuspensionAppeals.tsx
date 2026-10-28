import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { suspensionAppeals, decideSuspensionAppeal } from '@/lib/exam-appeals.functions';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
export function RestoreAttempt({attemptId,onSaved}:{attemptId:string;onSaved:()=>void}) {
 const [note,setNote]=useState(''); const [busy,setBusy]=useState(false);
 async function decide(approve:boolean) {setBusy(true);try {await decideSuspensionAppeal({data:{attemptId,approve,note}});toast.success(approve?'Suspension lifted. Unfinished saved attempts can resume.':'Appeal declined');onSaved();}catch {toast.error('Could not update the attempt. Retry.');}finally{setBusy(false);}}
 return <div className="space-y-2"><label className="block text-sm">Administrator decision reason<input className="mt-1 w-full rounded-md border bg-background p-2" value={note} maxLength={500} onChange={e=>setNote(e.target.value)} /></label><div className="flex gap-2"><Button disabled={busy || !note.trim()} onClick={()=>void decide(true)}>Unsuspend & allow resume</Button><Button variant="outline" disabled={busy || !note.trim()} onClick={()=>void decide(false)}>Decline appeal</Button></div></div>;
}
export function SuspensionAppeals() {
 const {data,isError,refetch}=useQuery({queryKey:['suspension-appeals'],queryFn:()=>suspensionAppeals(),refetchInterval:10000});
 return <section className="space-y-3 rounded-xl border p-5"><h2 className="text-lg font-bold">Suspension appeals</h2><p className="text-sm text-muted-foreground">Power loss and internet outages are valid reasons to request restoration. Review the explanation, then restore the saved attempt without a retake.</p>{isError && <Button onClick={()=>void refetch()}>Retry loading appeals</Button>}{data?.length===0 && <p>No appeals yet.</p>}{data?.map(a=><article key={a.id} className="space-y-3 rounded-lg border p-4"><p className="font-bold">{a.name} · {a.status}</p><p className="whitespace-pre-wrap text-sm">{a.reason}</p>{a.status==='pending' && <RestoreAttempt attemptId={a.attemptId} onSaved={()=>void refetch()} />}</article>)}</section>;
}
