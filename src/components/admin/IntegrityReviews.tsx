import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { integrityReviews, reviewIntegrity } from '@/lib/integrity.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function IntegrityReviews() {
  const qc=useQueryClient();
  const {data,isPending,isError,refetch}=useQuery({queryKey:['integrity-reviews'],queryFn:()=>integrityReviews(),refetchInterval:10000});
  return <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
    <h2 className="text-lg font-bold">Three-warning reviews</h2>
    <p className="text-sm text-muted-foreground">Review browser events before deciding. Warnings can result from technical issues and do not prove cheating. A suspension blocks new quizzes and exams across all courses until it expires. Camera and audio are not analyzed by AI.</p>
    {isPending && <p role="status">Loading reviews…</p>}
    {isError && <div role="alert">Could not load reviews. <Button variant="outline" onClick={()=>void refetch()}>Retry</Button></div>}
    {data?.length===0 && <p className="text-sm text-muted-foreground">No three-warning attempts to review.</p>}
    {data?.map(row=><Review key={row.id} row={row} onSaved={()=>{void qc.invalidateQueries({queryKey:['integrity-reviews']});}} />)}
  </section>;
}
function Review({row,onSaved}:{row:Awaited<ReturnType<typeof integrityReviews>>[number];onSaved:()=>void}) {
  const [amount,setAmount]=useState('1');
  const [unit,setUnit]=useState<'days'|'weeks'|'months'>('days');
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  async function decide(action:'dismiss'|'suspend') {
    setBusy(true);
    try {
      await reviewIntegrity({data:{attemptId:row.id,action,amount:Number(amount),unit,reason:reason.trim() || (action==='dismiss'?'Dismissed after administrator review':'')}});
      toast.success(action==='suspend'?'Assessment access suspended':'Review dismissed');onSaved();
    } catch {toast.error('Could not save the review. Check the duration and reason, then refresh or retry.');}
    finally{setBusy(false);}
  }
  return <article className="space-y-3 rounded-lg border border-border p-4">
    <p className="font-bold">{row.name} · 3 of 3 warnings</p>
    <p className="text-xs text-muted-foreground">Assessment {row.quizId} · {new Date(row.startedAt).toLocaleString()} · {row.status}</p>
    <ol className="list-decimal space-y-1 pl-5 text-sm">{row.events.map(e=><li key={e.number}>{e.reason}</li>)}</ol>
    {row.until && <p className="text-sm">Suspended until {new Date(row.until).toLocaleString()}</p>}
    {row.status==='pending' && <div className="space-y-2">
      <label className="block text-sm">Review reason<Input aria-label={`Review reason for ${row.name}`} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} /></label>
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label={`Suspension duration for ${row.name}`} className="w-24" type="number" min="1" max="365" step="1" value={amount} onChange={e=>setAmount(e.target.value)} />
        <select aria-label={`Suspension unit for ${row.name}`} className="h-9 rounded-md border border-input bg-background px-2" value={unit} onChange={e=>setUnit(e.target.value as typeof unit)}><option value="days">days</option><option value="weeks">weeks</option><option value="months">months</option></select>
        <Button variant="destructive" disabled={busy || !reason.trim() || !Number.isInteger(Number(amount)) || Number(amount)<1 || Number(amount)>365} onClick={()=>void decide('suspend')}>Suspend after review</Button>
        <Button variant="outline" disabled={busy} onClick={()=>void decide('dismiss')}>Dismiss warnings</Button>
      </div>
    </div>}
  </article>;
}
