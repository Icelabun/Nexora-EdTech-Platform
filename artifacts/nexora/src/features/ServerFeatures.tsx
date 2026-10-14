import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowRight, Check, Clock3, Gift, RotateCcw, Share2, Shield, Sparkles } from 'lucide-react';
import {
  getGetCurrentUserQueryKey, getGetDailyRewardQueryKey, getGetDashboardQueryKey, getGetEventSessionQueryKey, getGetPaymentHistoryQueryKey,
  getGetTournamentsQueryKey, useAnswerEventProblem, useCancelTournament, useClaimDailyReward,
  useGetCurrentUser, useGetDailyReward, useGetEventSession, useGetPaymentHistory, useGetTournaments,
  useRefundPayment, useStartEventSession,
} from '@workspace/api-client-react';
import type { DailyRewardClaim, EventSession } from '@workspace/api-client-react';

export function RankCelebration({ name, rank, onClose }: { name: string; rank: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  async function storyFile() {
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available in this browser.');
    const g = ctx.createLinearGradient(0, 0, 1080, 1920);
    g.addColorStop(0, '#17150f'); g.addColorStop(.56, '#09090b'); g.addColorStop(1, '#211b0e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1920);
    ctx.strokeStyle = 'rgba(205,166,57,.55)'; ctx.lineWidth = 2;
    ctx.strokeRect(64, 64, 952, 1792);
    ctx.strokeStyle = 'rgba(205,166,57,.18)'; ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(540, 860, 260 + i * 36, 0, Math.PI * 2); ctx.stroke(); }
    ctx.save(); ctx.translate(540, 660); ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 3; ctx.strokeRect(-145, -145, 290, 290);
    ctx.restore();
    ctx.textAlign = 'center'; ctx.fillStyle = '#c9a227'; ctx.font = '700 40px monospace'; ctx.fillText('NEXORA / HUNTER DOSSIER', 540, 245);
    ctx.font = '700 290px Georgia'; ctx.fillStyle = '#e4bd54'; ctx.fillText('N', 540, 770);
    ctx.font = '500 44px monospace'; ctx.fillStyle = '#a8a49a'; ctx.fillText('RANK ASCENDED', 540, 1120);
    ctx.font = '600 116px Georgia'; ctx.fillStyle = '#f0e8d3'; ctx.fillText(rank.toUpperCase(), 540, 1280);
    ctx.font = '500 52px "DM Sans", sans-serif'; ctx.fillStyle = '#d3c9af'; ctx.fillText(name, 540, 1415);
    ctx.font = '400 28px monospace'; ctx.fillStyle = '#8c846f'; ctx.fillText('THE NEXT CHAPTER IS YOURS', 540, 1680);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not create story card.')), 'image/png'));
    return new File([blob], 'nexora-rank-up.png', { type: 'image/png' });
  }
  async function share() {
    setBusy(true);
    try {
      const file = await storyFile();
      if (navigator.share && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'My Nexora rank-up' });
      else { const url = URL.createObjectURL(file); const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); URL.revokeObjectURL(url); }
    } finally { setBusy(false); }
  }
  return <div className="rank-celebration" role="dialog" aria-modal="true" aria-labelledby="rank-title">
    <div className="rank-celebration-card"><div className="eyebrow">Hunter dossier updated</div><div className="rank-monogram"><span>N</span></div>
      <p className="mono gold">RANK ASCENDED</p><h2 id="rank-title">{rank}-Rank</h2><p>{name}, the field has a new measure of your progress.</p>
      <button className="btn btn-gold" onClick={()=>void share()} disabled={busy} data-testid="button-share-rank-card">{busy?'Preparing story card…':'Share or download story card'} <Share2 size={15}/></button>
      <button className="btn btn-quiet" onClick={onClose} data-testid="button-close-rank-celebration">Continue</button>
    </div>
  </div>;
}

export function DashboardReward({ studentName }: { studentName: string }) {
  const qc = useQueryClient();
  const status = useGetDailyReward();
  const claim = useClaimDailyReward();
  const [award, setAward] = useState<DailyRewardClaim | null>(null);
  const [error, setError] = useState('');
  async function claimReward() {
    setError('');
    try {
      const result = await claim.mutateAsync();
      setAward(result);
      void qc.invalidateQueries({ queryKey: getGetDailyRewardQueryKey() });
      void qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      void qc.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
    } catch (e) { setError(e instanceof Error ? e.message : 'The gate reward could not be claimed.'); }
  }
  const welcome = status.data?.welcomeBack;
  return <section className="reward-gate panel" data-testid="panel-daily-reward">
    <div className="reward-gate-mark"><Gift size={22}/></div>
    <div className="reward-copy"><div className="eyebrow">{welcome ? 'A warm return' : 'The gate opens once each day'}</div>
      <h3>{welcome ? `Welcome back, ${studentName}.` : 'A small welcome, whenever you return.'}</h3>
      <p>{status.data?.claimedToday ? `Today’s reward is already yours: ${status.data.itemName} × ${status.data.itemQuantity}. Come back when it suits you.` : 'No streak to protect. Claim today’s welcome when you are ready.'}</p>
      {error&&<div className="form-error" role="alert">{error}</div>}
      {award&&<div className="reward-awarded" role="status"><Check size={16}/> +{award.xpAwarded} XP · {award.itemName} × {award.itemQuantity}</div>}
    </div>
    {status.isLoading ? <div className="skeleton reward-skeleton"/> : status.isError ? <button className="btn btn-quiet" onClick={()=>void status.refetch()} data-testid="button-retry-daily-reward"><RotateCcw size={14}/> Retry</button> :
      <button className="btn btn-gold" disabled={status.data?.claimedToday||claim.isPending} onClick={()=>void claimReward()} data-testid="button-claim-daily-reward">{status.data?.claimedToday?'Claimed today':claim.isPending?'Opening…':`Claim · ${status.data?.xpReward??50} XP`} <ArrowRight size={14}/></button>}
    {award?.rankUp&&<RankCelebration name={studentName} rank={award.hunterRank} onClose={()=>setAward(null)}/>}
  </section>;
}

const clock = (n:number) => `${Math.floor(n/3600).toString().padStart(2,'0')}:${Math.floor(n%3600/60).toString().padStart(2,'0')}:${(n%60).toString().padStart(2,'0')}`;
function CaseBoard({session}:{session:EventSession}) {
  const clues = session.clues;
  return <div className="case-board" aria-label="Connected case leads">
    {Array.from({length:7},(_,i)=>{
      const clue = clues.find(c=>c.position===i+1) ?? clues[i];
      const isOpen=Boolean(clue?.revealed);
      return <div className={`case-node ${isOpen?'revealed':''}`} key={clue?.id??i} data-testid={`case-lead-${i+1}`}>
        <span className="case-node-number">{String(i+1).padStart(2,'0')}</span><strong>{isOpen?clue.title:`Lead ${i+1}`}</strong>
        <small>{isOpen?clue.clue:'Evidence sealed'}</small>
      </div>;
    })}
  </div>;
}
export function DetectiveEventPage() {
  const {data:user}=useGetCurrentUser();
  const qc=useQueryClient(); const query=useGetEventSession({query:{refetchInterval:15_000}}); const start=useStartEventSession(); const answer=useAnswerEventProblem();
  const [seconds,setSeconds]=useState(0); const [selected,setSelected]=useState<number|null>(null);
  const [response,setResponse]=useState<{correct:boolean;explanation:string;rankUp:boolean;hunterRank:string;message:string;session:EventSession}|null>(null);
  const [notice,setNotice]=useState('');
  const session=response?.session??query.data?.session??null;
  useEffect(()=>{if(session)setSeconds(session.timeRemainingSeconds);},[session?.id,session?.currentLeadIndex,session?.status,session?.timeRemainingSeconds]);
  useEffect(()=>{if(!session||session.status!=='active')return;const timer=window.setInterval(()=>setSeconds(s=>Math.max(0,s-1)),1000);return()=>window.clearInterval(timer);},[session?.id,session?.status]);
  async function openCase(){setNotice('');try{await start.mutateAsync();void qc.invalidateQueries({queryKey:getGetEventSessionQueryKey()});}catch(e){setNotice(e instanceof Error?e.message:'The case could not be opened.');}}
  async function submit(i:number){const problem=session?.currentProblem;if(!problem||answer.isPending)return;setSelected(i);setNotice('');try{const r=await answer.mutateAsync({data:{stepId:problem.stepId,answerIndex:i}});setResponse(r);setSelected(null);void qc.invalidateQueries({queryKey:getGetEventSessionQueryKey()});void qc.invalidateQueries({queryKey:getGetCurrentUserQueryKey()});if(r.rewardGranted)void qc.invalidateQueries({queryKey:getGetDashboardQueryKey()});}catch(e){setSelected(null);setNotice(e instanceof Error?e.message:'Your answer could not reach the case file.');}}
  const isDone=session?.status==='completed';
  if(query.isLoading)return <div className="content"><div className="skeleton" style={{minHeight:300}}/></div>;
  if(query.isError)return <ContentPlaceholder><div className="panel"><h2>The case file is unavailable.</h2><button className="btn btn-quiet" onClick={()=>void query.refetch()}>Retry</button></div></ContentPlaceholder>;
  return <div className="content">
    <div className="page-heading"><div><div className="eyebrow">Two Doors / Supernatural case</div><h1>{session?.caseTitle??'A case is waiting.'}</h1><p>{session?.intro??query.data?.message??'A server-backed mystery, ready when you are.'}</p></div><div className="event-clock"><Clock3 size={17}/><span data-testid="text-event-time">{clock(seconds)}</span></div></div>
    {!session||session.status==='expired'?<section className="event-entry panel"><Shield size={28} className="gold"/><h2>{session?.status==='expired'?'This case has expired.':'The investigation starts with evidence.'}</h2><p className="muted">{session?.status==='expired'?'Your saved clues remain on the case file, but this one-time investigation cannot be restarted.':'The saved server session will resume if one is active. Choose the Solo route for a clear, no-penalty return to regular practice.'}</p><div className="event-entry-actions">{session?.status!=='expired'&&<button className="btn btn-gold" onClick={()=>void openCase()} disabled={!query.data?.available||start.isPending} data-testid="button-start-event">{start.isPending?'Opening case…':'Start / resume case'} <ArrowRight size={14}/></button>}<Link href="/app" className="btn btn-quiet" data-testid="button-event-solo">Choose Solo route</Link></div>{!query.data?.available&&<p className="muted">No penalty applies if you leave this route unchosen.</p>}</section>:
      <div className="event-layout">
        <section className="panel"><div className="panel-title"><div><h2>Case board</h2><small>SEVEN CONNECTED LEADS</small></div><span className="tag">FOCUS {session.focusRemaining}/{session.focusTotal}</span></div>
          <CaseBoard session={session}/>
          {session.monster&&<div className="monster-panel"><div className="monster-figure" aria-label={`${session.monster.name} animated monster`}><span/></div><div className="monster-data"><div className="eyebrow">Finale / {session.monster.name}</div><div className="finale-stages" aria-label="Three stage finale">{[1,2,3].map(stage=><i key={stage} className={stage<=Math.min(3,Math.max(1,Math.ceil((1-session.monster!.hp/session.monster!.maxHp)*3)))?'active':''}/>)}</div><div className="muted" style={{fontSize:10,margin:'6px 0 12px'}}>Stage {Math.min(3,Math.max(1,Math.ceil((1-session.monster.hp/session.monster.maxHp)*3)))} of 3</div><div className="hp-label"><span>MONSTER HP</span><span>{session.monster.hp}/{session.monster.maxHp}</span></div><div className="hp-bar enemy"><i style={{width:`${Math.max(0,session.monster.hp/session.monster.maxHp*100)}%`}}/></div></div></div>}
          <p className="muted event-no-penalty"><Shield size={14}/> Solo route is always available; leaving this case carries no streak penalty.</p>
        </section>
           <section className="panel event-question">
          {isDone?<div className="event-result"><div className="eyebrow">Case closed</div><Sparkles size={28} className="gold"/><h2>{session.reward.title}</h2><p>{session.reward.badge} · +{session.reward.xp} XP</p><button className="btn btn-gold" onClick={()=>void query.refetch()} data-testid="button-event-refresh">View case file</button></div>:
          session.currentProblem?<><div className="eyebrow">{session.currentProblem.finale?'Finale encounter':`${session.currentProblem.subject} · Lead ${session.currentLeadIndex+1}`}</div><h2>{session.currentProblem.title}</h2><p className="muted">{session.currentProblem.scene}</p><p className="question">{session.currentProblem.prompt}</p>
             {session.currentProblem.options.map((option,i)=><button key={`${session.currentProblem?.stepId}-${i}`} className={`option ${selected===i?'chosen':''}`} disabled={answer.isPending||seconds===0} onClick={()=>void submit(i)} data-testid={`button-event-answer-${i}`}><span className="option-key">{String.fromCharCode(65+i)}</span>{option}</button>)}
             {seconds===0&&<p className="form-error" role="alert">The case timer has ended. Your saved progress remains on the board.</p>}
            {answer.isPending&&<p className="muted">Checking the evidence…</p>}
            {response&&<div className={`explanation ${response.correct?'':'event-wrong'}`} role="status"><strong>{response.correct?'Lead confirmed.':'Not this time. Focus reduced; try again.'}</strong> {response.explanation}<p>{response.message}</p></div>}
          </>:<div className="empty-state"><strong>All leads reviewed</strong>The case response is being synchronized.</div>}
          {notice&&<div className="form-error" role="alert">{notice}</div>}
          {response?.rankUp&&<RankCelebration name={user?.name??'Hunter'} rank={response.hunterRank} onClose={()=>setResponse(null)}/>}
        </section>
      </div>}
  </div>;
}
function ContentPlaceholder({children}:{children:ReactNode}){return <main className="content">{children}</main>;}

function PaymentRows({admin}:{admin:boolean}) {
  const qc=useQueryClient();const query=useGetPaymentHistory();const refund=useRefundPayment();const [notice,setNotice]=useState('');
  async function doRefund(id:string){if(!window.confirm('Start a refund for this payment?'))return;setNotice('');try{const result=await refund.mutateAsync({paymentId:id});setNotice(result.message);void qc.invalidateQueries({queryKey:getGetPaymentHistoryQueryKey()});}catch(e){setNotice(e instanceof Error?e.message:'Refund could not be started.');}}
  return <ContentPlaceholder><div className="page-heading"><div><div className="eyebrow">{admin?'Operations / payments':'Your account / payments'}</div><h1>{admin?'Payment ledger.':'Payment history.'}</h1><p>{admin?'Every checkout state, refund, and failure in one view.':'Receipts and verification status for your account.'}</p></div></div>
    {notice&&<div className="status-note" role="status">{notice}</div>}
    {query.isLoading?<div className="loading-stack"><div className="skeleton"/><div className="skeleton"/></div>:query.isError?<div className="error-banner">Payments could not be loaded. <button className="btn btn-quiet" onClick={()=>void query.refetch()}>Retry</button></div>:
      !query.data?.payments.length?<div className="empty-state"><strong>No payment records</strong>New payment activity will appear here.</div>:
      <section className="panel"><div className="panel-title"><h2>{admin?'All transactions':'Transactions'}</h2><small>{query.data.payments.length} RECORDS</small></div><div className="payment-list">{query.data.payments.map(p=><article className="payment-row" key={p.id} data-testid={`payment-row-${p.id}`}><div><strong>{p.purpose}</strong><small>{p.txRef} · {new Date(p.createdAt).toLocaleString()}</small></div><div className="payment-amount">{p.amountEtb.toLocaleString()} {p.currency}</div><span className={`payment-status ${p.status.toLowerCase()}`}>{p.status}</span><div className="payment-refund">{p.refundStatus?`Refund · ${p.refundStatus}`:'—'}{p.refundAmountEtb!=null&&<small>{p.refundAmountEtb.toLocaleString()} ETB</small>}</div>{admin&&p.status.toLowerCase()==='successful'&&<button className="btn btn-quiet" onClick={()=>void doRefund(p.id)} disabled={refund.isPending} data-testid={`button-refund-${p.id}`}>{refund.isPending?'Working…':'Refund'}</button>}</article>)}</div></section>}
  </ContentPlaceholder>;
}
export function StudentPaymentsPage(){return <PaymentRows admin={false}/>;}
export function AdminPaymentsPage(){
  const qc=useQueryClient();const tournaments=useGetTournaments();const cancel=useCancelTournament();const [notice,setNotice]=useState('');
  const available=useMemo(()=>tournaments.data?.find(t=>!t.completed),[tournaments.data]);
  async function cancelOne(){if(!available||!window.confirm(`Cancel ${available.name}? Confirmed paid entries will be sent for refunds.`))return;try{const r=await cancel.mutateAsync({tournamentId:available.id});setNotice(r.message);void qc.invalidateQueries({queryKey:getGetTournamentsQueryKey()});void qc.invalidateQueries({queryKey:getGetPaymentHistoryQueryKey()});}catch(e){setNotice(e instanceof Error?e.message:'Tournament cancellation failed.');}}
  return <><PaymentRows admin/><div className="content admin-cancel-box"><section className="panel"><div className="eyebrow">Tournament control</div><h2 className="serif">Cancellation desk</h2>{tournaments.isLoading?<div className="skeleton"/>:available?<><p className="muted">Available event: <strong>{available.name}</strong> · {available.participants}/{available.capacity} hunters</p><button className="btn btn-quiet" disabled={cancel.isPending} onClick={()=>void cancelOne()} data-testid="button-cancel-tournament">{cancel.isPending?'Processing…':'Cancel tournament'}</button></>:<p className="muted">No available tournament can be cancelled right now.</p>}{notice&&<p role="status" className="status-note">{notice}</p>}</section></div></>;
}
