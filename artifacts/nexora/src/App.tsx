import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ArrowDownRight, ArrowRight, BookOpen, Check, ChevronRight, Crown, LockKeyhole, LogOut, MessageCircle, Shield, Swords, Trophy } from 'lucide-react';
import {
  getGetAssignmentsQueryKey, getGetClassesQueryKey, getGetClassStudentsQueryKey, getGetCurrentUserQueryKey, getGetDashboardQueryKey,
  getGetSubscriptionQueryKey, getGetTournamentLeaderboardQueryKey, getGetTournamentsQueryKey, useAbandonDungeon,
  useAnswerDungeonQuestion, useAnswerTournamentRound, useAskTutor, useCreateAssignment, useCreateClass, useGetClasses,
  useChooseDungeonBranch, useGetClassStudents, useGetCurrentUser, useGetDashboard,
  useGetAssignments, useGetLeaderboards, useGetSubjects, useGetSubscription, useGetTournamentLeaderboard, useGetTournaments,
  useJoinClass, useJoinTournament, useLogin, useLogout, usePauseDungeon, useRegister, useResumeDungeon, useSaveOnboarding,
  useSelectSubscription, useStartDungeon, useStartTournamentRound,
} from '@workspace/api-client-react';
import type { DungeonQuestion, StudentAssignment, Subject, Tournament, TournamentAnswer, TournamentRoundQuestion, User } from '@workspace/api-client-react';
import NotFound from '@/pages/not-found';
import { AdminPaymentsPage, DashboardReward, DetectiveEventPage as ServerEventPage, RankCelebration, StudentPaymentsPage } from '@/features/ServerFeatures';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 20_000 } } });
const ranks = ['E', 'D', 'C', 'B', 'A', 'S'];
const fallbackSubjects = ['Math', 'Physics', 'Chemistry', 'Biology', 'English', 'Aptitude'];
const STUDENT_ROLES: User['role'][] = ['student'];
const TEACHER_ROLES: User['role'][] = ['teacher'];
const ADMIN_ROLES: User['role'][] = ['admin'];
const MEMBER_ROLES: User['role'][] = ['student', 'teacher'];
function roleHome(user: User) {
  if (user.role === 'admin') return '/admin';
  if (user.role === 'teacher') return '/teacher';
  return user.onboardingComplete ? '/app' : '/onboarding';
}

function Mark({ size = 30 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-label="Nexora mark">
    <path d="M7 32V8h5l16 17V8h5v24h-5L12 15v17H7Z" stroke="#C9A227" strokeWidth="2.3" strokeLinejoin="round" />
    <path d="M7 8h5l16 17" stroke="#E5BE4A" strokeWidth="1" opacity=".45" />
  </svg>;
}

function Brand() { return <Link href="/" className="brand" data-testid="link-brand"><Mark /><span>NEXORA</span></Link>; }
function Topbar() {
  return <header className="topbar"><Brand /><nav className="nav-links">
    <a href="/#how-it-works">The method</a><a href="/#arena">The arena</a>
    <Link href="/login" className="btn btn-quiet">Sign in</Link><Link href="/register" className="btn btn-gold">Start your run <ArrowRight size={15}/></Link>
  </nav></header>;
}
function AppNav({ user, onLogout }: { user?: User; onLogout: () => void }) {
  const [path] = useLocation();
  const links = user?.role === 'admin'
    ? [['/admin', 'Overview'], ['/admin/payments', 'Payments'], ['/leaderboard', 'Rankings']]
    : user?.role === 'teacher'
    ? [['/teacher', 'Classes'], ['/leaderboard', 'Rankings'], ['/subscription', 'Plan']]
    : [['/app', 'Overview'], ['/dungeon', 'Dungeon'], ['/tournaments', 'Arena'], ['/leaderboard', 'Ranks'], ['/tutor', 'Tutor'], ['/subscription', 'Plan'], ['/payments', 'Payments']];
  return <div className="app-top"><Brand /><nav className="app-nav">{links.map(([href, label]) =>
    <Link key={href} href={href} className={path === href ? 'active' : ''} data-testid={`link-nav-${label.toLowerCase()}`}>{label}</Link>)}</nav>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="user-chip">{user?.name ?? 'Hunter'} · {user?.hunterRank ?? 'E-Rank'}</span>
      <button className="btn btn-quiet" style={{padding:'8px 10px'}} onClick={onLogout} aria-label="Sign out" data-testid="button-sign-out"><LogOut size={14}/></button>
    </div>
  </div>;
}
function Loading({ rows = 3 }: { rows?: number }) { return <div className="loading-stack" aria-label="Loading">{Array.from({length:rows},(_,i)=><div className="skeleton" key={i}/>)}</div>; }
function LoadError({ message = 'We could not reach Nexora right now.', retry }: { message?: string; retry: () => void }) {
  return <div className="error-banner" role="alert">{message} <button className="btn btn-quiet" onClick={retry} style={{marginLeft:10,padding:'6px 10px'}}>Try again</button></div>;
}
function PageHead({ kicker, title, copy, action }: { kicker: string; title: string; copy?: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{kicker}</div><h1>{title}</h1>{copy && <p>{copy}</p>}</div>{action}</div>;
}
function PublicFooter() { return <footer className="footer"><Brand/><span>Built for the next generation of Ethiopian thinkers.</span><span>© 2025 Nexora</span></footer>; }

function Landing() {
  return <div className="app-shell noise"><Topbar />
    <main>
      <section className="landing-hero">
        <div><div className="eyebrow">Your next chapter starts here</div>
          <h1 className="hero-title">The exam is a<br/>door. <em>Kick it open.</em></h1>
          <p className="hero-copy">EUEE prep, rebuilt as a world worth exploring. Enter a dungeon, sharpen your skills, and watch your rank rise—one confident run at a time.</p>
          <div className="hero-actions"><Link href="/register" className="btn btn-gold">Begin your journey <ArrowRight size={15}/></Link><Link href="/login" className="btn btn-quiet">I have an account</Link></div>
          <div className="statline"><span><b>6</b> core subjects</span><span><b>5</b> questions per run</span><span><b>∞</b> room to grow</span></div>
        </div>
        <div className="hero-art" aria-label="Geometric Nexora portal illustration"><div className="portal"><div className="portal-core"><Mark size={110}/></div><span className="orbit-label one">LEVEL UP / EVERY DAY</span><span className="orbit-label two">ADIS ABABA · ETHIOPIA</span></div><span className="hero-note">FIG. 01 — THE GATEWAY</span></div>
      </section>
      <div className="ticker">KNOWLEDGE IS MOMENTUM <span>/</span> BUILD YOUR RANK <span>/</span> OWN YOUR NEXT MOVE <span>/</span> EUEE, ON YOUR TERMS <span>/</span> KNOWLEDGE IS MOMENTUM</div>
      <section className="section" id="how-it-works">
        <div className="eyebrow">A better kind of practice</div><h2 className="section-heading">Small runs. Big<br/>main-character energy.</h2>
        <p className="section-intro">No endless question sheets. Just a focused loop that gives every minute a purpose—and every win somewhere to go.</p>
        <div className="feature-grid">
          <article className="feature-card"><div><Swords className="feature-icon" size={22}/><h3>Enter the dungeon</h3><p>Choose a subject and rank. Five focused questions. A boss at the end. The challenge meets you where you are.</p></div><span className="small-stat">01 / PRACTICE WITH PURPOSE</span></article>
          <article className="feature-card"><BookOpen className="feature-icon" size={21}/><h3>Build real mastery</h3><p>Each run gives you a clearer read on what you know—and your next best move.</p></article>
          <article className="feature-card"><Trophy className="feature-icon" size={21}/><h3>Rise together</h3><p>Earn XP, climb the ranks, and step into tournaments with your school community.</p></article>
        </div>
      </section>
      <section className="section section-split" id="arena">
        <div><div className="eyebrow">Your progress, in motion</div><h2 className="section-heading">Every session<br/>leaves a mark.</h2><p className="section-intro">Track subject mastery, find your next edge, and see the distance you have already covered. Progress is not a mood. It is visible.</p><Link href="/register" className="btn btn-quiet" style={{marginTop:23}}>See your future dashboard <ArrowRight size={15}/></Link></div>
        <div className="progress-visual">
          <div className="panel-title"><h3>Hunter dossier</h3><small>YOUR PROGRESS / LIVE</small></div>
          <div className="mock-row"><div className="mock-medal">C</div><div style={{flex:1}}><strong>Physics</strong><div className="meter"><i style={{width:'73%'}}/></div></div><span className="mono gold">73%</span></div>
          <div className="mock-row"><div className="mock-medal">B</div><div style={{flex:1}}><strong>Mathematics</strong><div className="meter"><i style={{width:'61%'}}/></div></div><span className="mono gold">61%</span></div>
          <div className="mock-row"><div className="mock-medal">A</div><div style={{flex:1}}><strong>Biology</strong><div className="meter"><i style={{width:'86%'}}/></div></div><span className="mono gold">86%</span></div>
          <div className="mock-row" style={{justifyContent:'space-between'}}><span className="muted">Weekly momentum</span><span className="gold mono">+240 XP <ArrowDownRight size={13}/></span></div>
        </div>
      </section>
      <section className="section" style={{paddingTop:15}}>
        <div className="eyebrow">Made for the long game</div><h2 className="section-heading">Confidence compounds.</h2>
        <div className="grid-3" style={{marginTop:35}}>
          <div className="panel"><span className="mono gold">01 / FOCUS</span><h3 className="serif" style={{fontSize:22}}>Start with your edge</h3><p className="muted">Point Nexora to the subjects that need attention. Your path adapts to you.</p></div>
          <div className="panel"><span className="mono gold">02 / MOMENTUM</span><h3 className="serif" style={{fontSize:22}}>Stack the small wins</h3><p className="muted">A quick run builds a habit that is easier to return to tomorrow.</p></div>
          <div className="panel"><span className="mono gold">03 / OWNERSHIP</span><h3 className="serif" style={{fontSize:22}}>Walk in ready</h3><p className="muted">The EUEE is one milestone. The capability you build lasts much longer.</p></div>
        </div>
      </section>
      <section className="cta-band"><div className="eyebrow" style={{justifyContent:'center'}}>The gate is open</div><h2 className="section-heading" style={{margin:'17px auto 12px'}}>Your story. Your rank.<br/>Your next move.</h2><p className="muted">Start free. Find your rhythm. Go further than you planned.</p><Link href="/register" className="btn btn-gold" style={{marginTop:20}}>Create your hunter profile <ArrowRight size={15}/></Link></section>
    </main><PublicFooter />
  </div>;
}

function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const register = useRegister(); const login = useLogin(); const qc = useQueryClient(); const [, setLocation] = useLocation();
  const isRegister = mode === 'register'; const pending = register.isPending || login.isPending;
  const [error,setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); const fd = new FormData(e.currentTarget);
    try {
      const result = isRegister
        ? await register.mutateAsync({data:{name:String(fd.get('name')),email:String(fd.get('email')),password:String(fd.get('password')),grade:Number(fd.get('grade')),school:String(fd.get('school')),role:String(fd.get('role')) as 'student'|'teacher'}})
        : await login.mutateAsync({data:{email:String(fd.get('email')),password:String(fd.get('password'))}});
      qc.setQueryData(getGetCurrentUserQueryKey(), result); setLocation(roleHome(result));
    } catch (err) { setError(err instanceof Error ? err.message : 'That did not work. Check your details and try again.'); }
  }
  return <div className="app-shell noise"><Topbar/><main className="auth-wrap"><div className="auth-card">
    <div className="eyebrow">{isRegister ? 'Create your hunter profile' : 'Good to have you back'}</div>
    <h1>{isRegister ? 'Start with a name.' : 'Pick up your progress.'}</h1><p className="auth-sub">{isRegister ? 'A few details. Then we build a path around you.' : 'Your next run is waiting.'}</p>
    <form onSubmit={submit}>
      {isRegister && <><div className="field"><label htmlFor="name">Full name</label><input id="name" name="name" required minLength={2} placeholder="e.g. Hana Bekele" data-testid="input-name"/></div>
        <div className="field"><label htmlFor="role">I am joining as</label><select id="role" name="role" defaultValue="student" required data-testid="select-role"><option value="student">Student</option><option value="teacher">Teacher</option></select></div>
        <div className="form-grid"><div className="field"><label htmlFor="grade">Grade</label><select id="grade" name="grade" defaultValue="12" required data-testid="select-grade"><option value="12">Grade 12</option><option value="11">Grade 11</option></select></div><div className="field"><label htmlFor="school">School</label><input id="school" name="school" required placeholder="Your school" data-testid="input-school"/></div></div></>}
      <div className="field"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" data-testid="input-email"/></div>
      <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" minLength={8} autoComplete={isRegister ? 'new-password' : 'current-password'} required placeholder="At least 8 characters" data-testid="input-password"/></div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="btn btn-gold" type="submit" disabled={pending} style={{width:'100%',marginTop:8}} data-testid="button-submit-auth">{pending ? 'One moment…' : isRegister ? 'Create my account' : 'Sign in'} <ArrowRight size={15}/></button>
    </form>
    <div className="auth-foot">{isRegister ? 'Already have a profile?' : 'New to Nexora?'} <Link href={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link></div>
  </div></main><PublicFooter/></div>;
}

function Onboarding() {
  const {data:subjects,isLoading,isError,refetch} = useGetSubjects();
  const save = useSaveOnboarding(); const qc = useQueryClient(); const [,setLocation]=useLocation();
  const [selected,setSelected] = useState<string[]>([]); const [error,setError]=useState('');
  const items: Subject[] = subjects ?? fallbackSubjects.map((name,i)=>({id:String(i),name,questionCount:0,mastery:0}));
  function toggle(name:string) { setSelected(s => s.includes(name) ? s.filter(x=>x!==name) : s.length<6 ? [...s,name] : s); }
  async function submit() { if(!selected.length){setError('Choose at least one subject to shape your first route.');return;} setError('');try{const user=await save.mutateAsync({data:{weakestSubjects:selected}});qc.setQueryData(getGetCurrentUserQueryKey(),user);setLocation('/app');}catch(e){setError(e instanceof Error?e.message:'Could not save your subjects. Try again.');} }
  return <div className="app-shell noise"><Topbar/><main className="auth-wrap"><section className="auth-card" style={{width:'min(100%,660px)'}}><div className="eyebrow">01 / Your starting point</div><h1>Where do you want<br/>your next win?</h1><p className="auth-sub">Pick the subjects you want to strengthen first. You can change your direction anytime.</p>
    {isLoading ? <Loading rows={3}/> : isError ? <LoadError retry={()=>void refetch()}/> : <div className="subject-select-grid">{items.map((s,i)=><button key={s.id} className={`subject-pick ${selected.includes(s.name)?'selected':''}`} onClick={()=>toggle(s.name)} data-testid={`button-subject-${i}`}><span style={{display:'flex',justifyContent:'space-between',gap:10}}>{s.name}{selected.includes(s.name)&&<Check size={16} className="gold"/>}</span><small>{s.questionCount ? `${s.questionCount} questions to explore`:'Build your mastery here'}</small></button>)}</div>}
    {error && <div className="form-error">{error}</div>}<button className="btn btn-gold" onClick={()=>void submit()} disabled={save.isPending||isLoading} data-testid="button-save-onboarding">Set my course <ArrowRight size={15}/></button><span className="muted" style={{marginLeft:14,fontSize:11}}>{selected.length} selected · up to 6</span>
  </section></main></div>;
}

function JoinClassPanel() {
  const join = useJoinClass();
  const qc = useQueryClient();
  const [code,setCode] = useState('');
  const [notice,setNotice] = useState('');
  const [joined,setJoined] = useState<{name:string;joinCode:string}|null>(null);
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice('');
    try {
      const classInfo = await join.mutateAsync({data:{joinCode:code.trim().toUpperCase()}});
      setJoined({name:classInfo.name,joinCode:classInfo.joinCode});
      void qc.invalidateQueries({queryKey:getGetAssignmentsQueryKey()});
      setNotice(`You are in ${classInfo.name}.`);
      setCode('');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'That code did not open a class. Check it and try again.');
    }
  }
  return <section className="panel" style={{marginTop:16}}>
    <div className="panel-title"><h2>Join your class</h2><small>TEACHER JOIN CODE</small></div>
    <p className="muted" style={{fontSize:13,lineHeight:1.7}}>Got a code from your teacher? Enter it here to join your shared learning field.</p>
    {joined&&<div className="list-row"><div><strong>{joined.name}</strong><small>Class code accepted</small></div><span className="class-code">{joined.joinCode}</span></div>}
    {notice&&<div className={joined?'muted':'form-error'} role="status" style={{fontSize:12,margin:'10px 0'}}>{notice}</div>}
    <form onSubmit={submit} style={{display:'flex',gap:9,maxWidth:540}}>
      <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} required minLength={4} maxLength={20} autoCapitalize="characters" placeholder="Enter your class code" aria-label="Teacher class join code" data-testid="input-class-join-code" style={{flex:1,minWidth:0,background:'#0b0b0e',border:'1px solid #36353b',color:'#eee',borderRadius:6,padding:12,letterSpacing:'.12em'}}/>
      <button className="btn btn-gold" disabled={join.isPending} data-testid="button-join-class">{join.isPending?'Joining…':'Join class'} <ArrowRight size={14}/></button>
    </form>
  </section>;
}

function AssignmentPanel() {
  const {data,isLoading,isError,refetch}=useGetAssignments();
  const [,setLocation]=useLocation();
  function openAssignment(assignment:StudentAssignment) {
    setLocation(`/dungeon?subject=${encodeURIComponent(assignment.subject)}&rank=${encodeURIComponent(assignment.rank)}`);
  }
  return <section className="panel" style={{marginTop:16}}>
    <div className="panel-title"><h2>Class assignments</h2><small>YOUR NEXT OBJECTIVES</small></div>
    {isLoading?<Loading rows={2}/>:isError?<LoadError retry={()=>void refetch()}/>:!data?.length
      ?<div className="empty-state"><strong>No assignments yet</strong>Join a class with your teacher’s code to see assigned practice here.</div>
      :data.map(assignment=><div className="list-row" key={assignment.id}>
        <div><strong>{assignment.title}</strong><small>{assignment.className} · {assignment.subject} · {assignment.rank}-Rank · due {new Date(assignment.dueAt).toLocaleString()}</small></div>
        <button className="btn btn-quiet" style={{padding:'8px 10px',flexShrink:0}} onClick={()=>openAssignment(assignment)} data-testid={`button-assignment-${assignment.id}`}>Practice <ArrowRight size={13}/></button>
      </div>)}
  </section>;
}

function DashboardPage() {
  const {data,isLoading,isError,refetch}=useGetDashboard();
  if(isLoading)return <Content><PageHead kicker="Your command center" title="Loading your dossier…"/><Loading/></Content>;
  if(isError||!data)return <Content><PageHead kicker="Your command center" title="Your dossier is offline"/><LoadError retry={()=>void refetch()}/></Content>;
  const {user,subjectMastery,recentRuns,dailyRunsRemaining}=data;
  return <Content><div className="panel dashboard-hero"><div><div className="eyebrow">Your next move</div><h2>Good to see you,<br/>{user.name.split(' ')[0]}.</h2><p>Your path is yours to shape. One run at a time.</p><Link href="/dungeon" className="btn btn-gold" style={{marginTop:12}}>Enter a dungeon <Swords size={15}/></Link><div className="statline"><span><b>{user.xp.toLocaleString()} XP</b>Total experience</span><span><b>{user.hunterRank}</b>Your hunter rank</span><span><b>{dailyRunsRemaining}</b>Runs remaining today</span></div></div><div className="level-disc"><div><small>HUNTER RANK</small><strong>{user.hunterRank}</strong><small>LEVEL {user.level}</small></div></div></div>
    <DashboardReward studentName={user.name.split(' ')[0]}/>
    <div className="grid-2" style={{marginTop:16}}><section className="panel"><div className="panel-title"><h2>Subject mastery</h2><small>YOUR SKILL MAP</small></div>{subjectMastery.length?subjectMastery.map((s,i)=><div className="subject-line" key={`${s.subject}-${i}`}><div><strong>{s.subject}</strong><div className="meter"><i style={{width:`${Math.max(0,Math.min(100,s.mastery))}%`}}/></div></div><small>{s.mastery}%</small></div>):<div className="empty-state"><strong>First steps count</strong>Your subject map will take shape after a few runs.</div>}</section>
       <section className="panel"><div className="panel-title"><h2>Recent runs</h2><small>FIELD NOTES</small></div>{recentRuns.length?recentRuns.slice(0,5).map(run=><div className="list-row" key={run.id}><div><strong>{run.subject} · {run.rank}-Rank</strong><small>{new Date(run.completedAt).toLocaleDateString()}</small></div><span className="mono gold">+{run.xpEarned} XP</span></div>):<div className="empty-state"><strong>Fresh slate</strong>Your completed runs will appear here.</div>}</section></div>
    <AssignmentPanel/><JoinClassPanel/>
  </Content>;
}
function Content({children}:{children:ReactNode}){return <main className="content">{children}</main>;}

function DungeonPage() {
  const {data:user}=useGetCurrentUser();
  const {data:subjects,isLoading:subjectsLoading,isError:subjectsError,refetch}=useGetSubjects();
  const start=useStartDungeon(); const answer=useAnswerDungeonQuestion(); const abandon=useAbandonDungeon(); const pause=usePauseDungeon(); const resume=useResumeDungeon(); const chooseBranch=useChooseDungeonBranch(); const qc=useQueryClient();const [,setLocation]=useLocation();
  const initialParams=new URLSearchParams(window.location.search);
  const [subject,setSubject]=useState(initialParams.get('subject')??'');const [rank,setRank]=useState(initialParams.get('rank')??'E');const [mode,setMode]=useState<'standard'|'quick'>('standard');const [question,setQuestion]=useState<DungeonQuestion|null>(null);const [answerIndex,setAnswerIndex]=useState<number|null>(null);const [result,setResult]=useState<Awaited<ReturnType<typeof answer.mutateAsync>>|null>(null);const [error,setError]=useState('');const [branch,setBranch]=useState(false);const [branchChoiceResolved,setBranchChoiceResolved]=useState(false);const [branchError,setBranchError]=useState('');const [resetNotice,setResetNotice]=useState('');const [focusGrace,setFocusGrace]=useState<number|null>(null);const [paused,setPaused]=useState(false);const [pauseRemaining,setPauseRemaining]=useState(0);const [runSeconds,setRunSeconds]=useState(0);
  useEffect(()=>{if(user?.branchUnlocked&&!user.branchChoice&&!branchChoiceResolved){setBranch(true);}},[user?.branchUnlocked,user?.branchChoice,branchChoiceResolved]);
  useEffect(()=>{if(!question||result?.completed||paused)return;let timer:number|undefined;let deadline=0;let didReset=false;const resetRun=()=>{if(didReset)return;didReset=true;if(timer)window.clearInterval(timer);timer=undefined;setFocusGrace(null);abandon.mutate({runId:question.runId,data:{reason:'focus-grace-expired'}});setQuestion(null);setResult(null);setResetNotice('The five-second return window ended. Your run was safely closed; start again whenever you are ready.');};const beginGrace=()=>{if(timer)return;deadline=Date.now()+5000;setFocusGrace(5);timer=window.setInterval(()=>{const remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));setFocusGrace(remaining);if(remaining===0)resetRun();},100);};const restore=()=>{if(document.visibilityState!=='visible'||!timer)return;if(Date.now()>=deadline){resetRun();return;}window.clearInterval(timer);timer=undefined;setFocusGrace(null);};const visibility=()=>document.visibilityState==='hidden'?beginGrace():restore();window.addEventListener('blur',beginGrace);window.addEventListener('focus',restore);document.addEventListener('visibilitychange',visibility);return()=>{if(timer)window.clearInterval(timer);window.removeEventListener('blur',beginGrace);window.removeEventListener('focus',restore);document.removeEventListener('visibilitychange',visibility);}},[question?.runId,result?.completed,paused]);
  useEffect(()=>{if(!paused||!question)return;const deadline=Date.now()+pauseRemaining*1000;const timer=window.setInterval(()=>{const remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));setPauseRemaining(remaining);if(remaining===0){window.clearInterval(timer);resume.mutate({runId:question.runId},{onSuccess:state=>{setPaused(state.paused);setPauseRemaining(0);setRunSeconds(state.timeRemainingSeconds);setQuestion(q=>q?{...q,paused:state.paused,pauseUsed:state.pauseUsed,pauseExpiresAt:state.pauseExpiresAt,timeRemainingSeconds:state.timeRemainingSeconds}:q);},onError:()=>setError('The automatic resume could not be confirmed. Use Resume run to reconnect.')});}},100);return()=>window.clearInterval(timer);},[paused,question?.runId]);
  useEffect(()=>{if(!question||question.mode!=='quick'||paused||result?.completed)return;let remaining=runSeconds;const timer=window.setInterval(()=>setRunSeconds(s=>{remaining=Math.max(0,remaining-1);if(remaining===0){window.clearInterval(timer);abandon.mutate({runId:question.runId,data:{reason:'timer-expired'}});setQuestion(null);setResult(null);setResetNotice('The five-minute Quick run timer ended. Your next session is ready whenever you are.');return 0;}return remaining;}),1000);return()=>window.clearInterval(timer);},[question?.questionId,question?.mode,paused,result?.completed]);
  async function begin(){setError('');setResetNotice('');try{const q=await start.mutateAsync({data:{subject,rank:rank as 'E'|'D'|'C'|'B'|'A'|'S',mode}});setQuestion(q);setRunSeconds(q.timeRemainingSeconds);setPaused(q.paused);setPauseRemaining(q.pauseExpiresAt?Math.max(0,Math.ceil((new Date(q.pauseExpiresAt).getTime()-Date.now())/1000)):0);setResult(null);setAnswerIndex(null);}catch(e){setError(e instanceof Error?e.message:'Could not open this dungeon. Try another route.');}}
  async function togglePause(){if(!question)return;try{const state=paused?await resume.mutateAsync({runId:question.runId}):await pause.mutateAsync({runId:question.runId});setPaused(state.paused);setPauseRemaining(state.paused&&state.pauseExpiresAt?Math.max(0,Math.ceil((new Date(state.pauseExpiresAt).getTime()-Date.now())/1000)):0);if(!state.paused)setRunSeconds(state.timeRemainingSeconds);setQuestion(q=>q?{...q,paused:state.paused,pauseUsed:state.pauseUsed,pauseExpiresAt:state.pauseExpiresAt,timeRemainingSeconds:state.timeRemainingSeconds}:q);}catch(e){setError(e instanceof Error?e.message:'Pause state could not be updated.');}}
  async function submit(index:number){if(!question||answer.isPending)return;setAnswerIndex(index);setError('');try{const r=await answer.mutateAsync({runId:question.runId,data:{questionId:question.questionId,answerIndex:index}});setResult(r);if(r.completed&&r.branchUnlocked&&r.accuracy>=95&&!branchChoiceResolved){setBranch(true);setBranchError('');}if(r.completed){qc.invalidateQueries({queryKey:getGetDashboardQueryKey()});qc.invalidateQueries({queryKey:getGetCurrentUserQueryKey()});}}catch(e){setError(e instanceof Error?e.message:'Answer did not reach the server. Try again.');setAnswerIndex(null);}}
  async function selectBranch(choice:'solo'|'event'){if(chooseBranch.isPending||branchChoiceResolved)return;setBranchError('');try{await chooseBranch.mutateAsync({data:{choice}});setBranchChoiceResolved(true);setBranch(false);void qc.invalidateQueries({queryKey:getGetCurrentUserQueryKey()});if(choice==='event')setLocation('/event');}catch(e){setBranchError(e instanceof Error?e.message:'Could not save your Two Doors choice. Try again.');}}
  function next(){if(result?.nextQuestion){setQuestion(result.nextQuestion);setResult(null);setAnswerIndex(null);}else{setQuestion(null);setResult(null);}}
  const branchModal=branch?<div className="branch-modal"><div className="branch-box"><div className="eyebrow">A rare route has opened</div><h2>Two Doors</h2><p>You reached the 95% accuracy threshold. Choose your path once: continue solo, or enter the one-hour math and logic detective event.</p>{branchError&&<div className="form-error" role="alert">{branchError}</div>}<div style={{display:'flex',gap:10,flexWrap:'wrap'}}><button className="btn btn-quiet" disabled={chooseBranch.isPending} onClick={()=>void selectBranch('solo')} data-testid="button-branch-solo">Solo path</button><button className="btn btn-gold" disabled={chooseBranch.isPending} onClick={()=>void selectBranch('event')} data-testid="button-branch-event">{chooseBranch.isPending?'Saving choice…':'Enter the event'} <ArrowRight size={14}/></button></div></div></div>:null;
  if(!question)return <Content><PageHead kicker="The field" title="Choose your dungeon" copy="A focused five-question run. Choose your subject, set your rank, and make your next move."/>
    {resetNotice&&<div className="error-banner">{resetNotice}</div>}
    <div className="grid-2"><section className="panel"><div className="panel-title"><h2>01 / Subject</h2><small>CHOOSE YOUR TERRAIN</small></div>
      {subjectsLoading?<Loading rows={3}/>:subjectsError?<LoadError retry={()=>void refetch()}/>:<div className="subject-select-grid">{(subjects??[]).map(s=><button key={s.id} className={`subject-pick ${subject===s.name?'selected':''}`} onClick={()=>setSubject(s.name)} data-testid={`button-dungeon-subject-${s.id}`}><span>{s.name}</span><small>{s.questionCount} questions · {s.mastery}% mastery</small></button>)}</div>}
      {!subjectsLoading&&!subjectsError&&!(subjects?.length)&&<div className="empty-state">No subjects are available yet.</div>}
      <div className="panel-title" style={{marginTop:25}}><h2>02 / Rank</h2><small>SET THE PACE</small></div><div className="rank-row">{ranks.map(r=><button key={r} onClick={()=>setRank(r)} className={`rank-btn ${rank===r?'selected':''}`} data-testid={`button-rank-${r}`}>{r}-RANK</button>)}</div>
      <div className="panel-title" style={{marginTop:25}}><h2>03 / Run style</h2><small>CHOOSE YOUR WINDOW</small></div><div className="rank-row"><button className={`rank-btn ${mode==='standard'?'selected':''}`} onClick={()=>setMode('standard')} data-testid="button-dungeon-standard">Standard</button><button className={`rank-btn ${mode==='quick'?'selected':''}`} onClick={()=>setMode('quick')} data-testid="button-dungeon-quick">Quick · 5 questions · 5 minutes</button></div>
      {error&&<div className="form-error">{error}</div>}<button className="btn btn-gold" disabled={!subject||start.isPending} onClick={()=>void begin()} data-testid="button-start-dungeon">{start.isPending?'Opening the gate…':'Enter the dungeon'} <Swords size={15}/></button>
    </section><aside className="panel"><div className="eyebrow">A quick briefing</div><h2 className="serif" style={{fontSize:28}}>Five questions.<br/>One clean run.</h2><p className="muted" style={{lineHeight:1.8,fontSize:13}}>Your HP, enemy HP, XP and outcomes are calculated by the server. Stay in the arena until your run resolves.</p><div className="list-row"><span>Session focus</span><Shield size={16} className="gold"/></div><div className="list-row"><span>Boss encounter</span><Swords size={16} className="gold"/></div><div className="list-row"><span>Progress saved server-side</span><LockKeyhole size={16} className="gold"/></div></aside></div>
    {branchModal}</Content>;
  return <Content><PageHead kicker={`${question.subject} / ${question.rank}-Rank`} title={result?.completed?'Run complete':`Question ${question.questionNumber} of ${question.totalQuestions}`} copy={question.mode==='quick'?`Quick run · ${Math.floor(runSeconds/60).toString().padStart(2,'0')}:${(runSeconds%60).toString().padStart(2,'0')} remaining · server timed for five minutes.`:'Stay in focus. Your progress is held by the arena.'} action={<button className="btn btn-quiet" onClick={()=>void togglePause()} disabled={pause.isPending||resume.isPending||(!paused&&question.pauseUsed)} data-testid="button-dungeon-pause">{paused?`Resume · ${pauseRemaining}s`:question.pauseUsed?'Pause used':'Pause once'}</button>}/>
    {focusGrace!==null&&<div className="focus-countdown" role="alert" data-testid="status-focus-countdown"><strong>Return to the dungeon</strong><span>Your run will close in {focusGrace} seconds.</span></div>}
    {paused&&<div className="pause-cover" role="status" data-testid="status-dungeon-paused"><div><Shield size={25}/><strong>Run paused</strong><span>Question covered · {pauseRemaining} seconds remain</span><button className="btn btn-gold" onClick={()=>void togglePause()} disabled={resume.isPending}>Resume run</button></div></div>}
    <div className="dungeon-top"><div className="hp-group"><div className="hp-label"><span>YOUR HP</span><span>{result?.playerHp??question.playerHp}</span></div><div className="hp-bar"><i style={{width:`${Math.max(0,Math.min(100,result?.playerHp??question.playerHp))}%`}}/></div></div><div className="hp-group"><div className="hp-label"><span>{question.isBoss?'BOSS':'ENEMY'} HP</span><span>{result?.enemyHp??question.enemyHp}</span></div><div className="hp-bar enemy"><i style={{width:`${Math.max(0,Math.min(100,result?.enemyHp??question.enemyHp))}%`}}/></div></div></div>
    <div className="boss-arena"><div className="boss-sigil"><Mark size={55}/></div><div className="boss-caption">{question.isBoss?'BOSS ENCOUNTER':'DUNGEON GUARDIAN'} · {question.rank} RANK</div></div>
    <div className="panel question-card"><div className="eyebrow">{question.isBoss?'Final encounter':'Field question'} / {question.questionNumber.toString().padStart(2,'0')}</div><p className="question">{question.prompt}</p><div>{question.options.map((option,i)=><button key={`${question.questionId}-${i}`} className={`option ${answerIndex===i?'chosen':''}`} disabled={!!result||answer.isPending||paused||(question.mode==='quick'&&runSeconds===0)} onClick={()=>void submit(i)} data-testid={`button-answer-${i}`}><span className="option-key">{String.fromCharCode(65+i)}</span>{option}</button>)}</div>
      {answer.isPending&&<p className="muted">The arena is resolving your answer…</p>}{result&&<><div className="explanation"><strong>{result.correct?'Correct move.':'Good lesson for the next run.'}</strong> {result.explanation}</div>
        {result.completed?<div className="result-card"><div className="eyebrow" style={{justifyContent:'center'}}>Run resolved / {result.hunterRank}-Rank</div><h2>{result.levelUp?'Level up.':'You showed up.'}</h2><div className="gold-number">+{result.xpEarned} XP</div><p className="muted">Accuracy {result.accuracy}% · server-scored</p><button className="btn btn-gold" onClick={next}>Back to dungeon select <ArrowRight size={14}/></button>{result.rankUp&&user&&<RankCelebration name={user.name} rank={result.hunterRank} onClose={()=>setResult(null)}/>}</div>
        :<button className="btn btn-gold" onClick={next} style={{marginTop:10}}>Next question <ChevronRight size={15}/></button>}</>}
      {error&&<div className="form-error">{error}</div>}
    </div>
    {branchModal}
  </Content>;
}

function DetectiveEventPage() { return <ServerEventPage/>; }

function TutorPage(){
  const ask=useAskTutor();const [messages,setMessages]=useState<{role:'assistant'|'user';text:string}[]>([{role:'assistant',text:'Welcome to the field, Hunter. I am here to help you find the next step—not hand you a shortcut. What are you working through?'}]);const [text,setText]=useState('');const [subject,setSubject]=useState('');const [error,setError]=useState('');
  async function send(e:FormEvent){e.preventDefault();if(!text.trim()||ask.isPending)return;const message=text.trim();setText('');setError('');setMessages(m=>[...m,{role:'user',text:message}]);try{const reply=await ask.mutateAsync({data:{message,subject:subject||undefined,context:'Supportive EUEE study session'}});setMessages(m=>[...m,{role:'assistant',text:reply.answer}]);}catch(err){setError(err instanceof Error?err.message:'The guide is temporarily out of range. Try again.');}}
  return <Content><PageHead kicker="Your game master" title="Think it through." copy="A calm guide for the tricky bit. Ask for a hint, a clearer explanation, or a better way to approach the problem."/>
    <section className="panel chat-window">{messages.map((m,i)=><div key={i} className={`chat-message ${m.role==='user'?'user':'assistant'}`}>{m.role==='assistant'&&<div className="gold mono" style={{fontSize:9,marginBottom:6}}>NEXORA GUIDE</div>}{m.text}</div>)}{ask.isPending&&<div className="chat-message"><span className="gold mono">NEXORA GUIDE</span><br/>Thinking through the best next hint…</div>}
      <form className="chat-compose" onSubmit={send}><select value={subject} onChange={e=>setSubject(e.target.value)} aria-label="Choose subject" style={{background:'#0b0b0e',border:'1px solid #36353b',color:'#aaa',borderRadius:6,padding:'0 8px'}}><option value="">Any subject</option>{fallbackSubjects.map(s=><option key={s}>{s}</option>)}</select><input value={text} onChange={e=>setText(e.target.value)} maxLength={3000} placeholder="Tell me where you're stuck…" data-testid="input-tutor-message"/><button className="btn btn-gold" disabled={ask.isPending||!text.trim()} type="submit" data-testid="button-send-tutor"><MessageCircle size={15}/> Ask</button></form>
    </section>{error&&<div className="form-error">{error}</div>}</Content>;
}

function TournamentsPage(){
  const {data,isLoading,isError,refetch}=useGetTournaments();
  const join=useJoinTournament();
  const startRound=useStartTournamentRound();
  const answerRound=useAnswerTournamentRound();
  const qc=useQueryClient();
  const [activeId,setActiveId]=useState<string|null>(null);
  const [activeQuestion,setActiveQuestion]=useState<TournamentRoundQuestion|null>(null);
  const [answerResult,setAnswerResult]=useState<TournamentAnswer|null>(null);
  const [selectedAnswer,setSelectedAnswer]=useState<number|null>(null);
  const [secondsLeft,setSecondsLeft]=useState(0);
  const [notice,setNotice]=useState(()=>new URLSearchParams(window.location.search).has('checkout')?'Payment is awaiting server verification. Your entry will remain unconfirmed until the payment provider confirms it.':'');
  const activeTournament=data?.find(t=>t.id===activeId);
  const standings=useGetTournamentLeaderboard(activeId??'',{query:{queryKey:getGetTournamentLeaderboardQueryKey(activeId??''),enabled:Boolean(activeId),refetchInterval:5000}});

  async function beginRound(id:string){
    setActiveId(id);setNotice('');
    try{
      const question=await startRound.mutateAsync({tournamentId:id});
      setActiveQuestion(question);setAnswerResult(null);setSelectedAnswer(null);setSecondsLeft(question.timeRemainingSeconds);
    }catch(e){
      setActiveQuestion(null);setAnswerResult(null);
      setNotice(e instanceof Error?e.message:'Could not resume this round.');
      void qc.invalidateQueries({queryKey:getGetTournamentsQueryKey()});
      void qc.invalidateQueries({queryKey:getGetTournamentLeaderboardQueryKey(id)});
    }
  }
  async function enter(t:Tournament){
    setNotice('');
    if(t.joined){
      setActiveId(t.id);
      if(t.completed){setActiveQuestion(null);setAnswerResult(null);return;}
      await beginRound(t.id);
      return;
    }
    try{
      const response=await join.mutateAsync({tournamentId:t.id});
      if(t.paid){
        if(response.checkoutUrl){window.location.assign(response.checkoutUrl);return;}
        setNotice(response.message||`Payment status: ${response.paymentStatus}. Entry is not confirmed until provider verification.`);
        void qc.invalidateQueries({queryKey:getGetTournamentsQueryKey()});
        return;
      }
      setNotice(response.message||`Entry status: ${response.paymentStatus}`);
      setActiveId(t.id);
      void qc.invalidateQueries({queryKey:getGetTournamentsQueryKey()});
    }catch(e){setNotice(e instanceof Error?e.message:'Could not join this event.');}
  }
  async function submitAnswer(index:number){
    if(!activeId||!activeQuestion||answerRound.isPending||secondsLeft<=0)return;
    setSelectedAnswer(index);setNotice('');
    try{
      const result=await answerRound.mutateAsync({tournamentId:activeId,data:{questionId:activeQuestion.questionId,answerIndex:index}});
      setAnswerResult(result);
      void qc.invalidateQueries({queryKey:getGetTournamentLeaderboardQueryKey(activeId)});
      if(result.tournamentComplete)void qc.invalidateQueries({queryKey:getGetTournamentsQueryKey()});
    }catch(e){
      setActiveQuestion(null);setAnswerResult(null);
      setNotice(e instanceof Error?e.message:'The arena could not score that answer.');
      void qc.invalidateQueries({queryKey:getGetTournamentsQueryKey()});
      void qc.invalidateQueries({queryKey:getGetTournamentLeaderboardQueryKey(activeId)});
    }
  }
  async function checkExpiredRound(){
    if(!activeId)return;
    try{
      const question=await startRound.mutateAsync({tournamentId:activeId});
      setActiveQuestion(question);setSecondsLeft(question.timeRemainingSeconds);
      setNotice('The server confirmed the round is still open.');
    }catch(e){
      setActiveQuestion(null);setAnswerResult(null);
      setNotice(e instanceof Error?e.message:'The round time has ended.');
      void qc.invalidateQueries({queryKey:getGetTournamentsQueryKey()});
      void qc.invalidateQueries({queryKey:getGetTournamentLeaderboardQueryKey(activeId)});
    }
  }
  function advance(){
    if(!answerResult)return;
    if(answerResult.nextQuestion){
      setActiveQuestion(answerResult.nextQuestion);
      setSecondsLeft(answerResult.nextQuestion.timeRemainingSeconds);
      setAnswerResult(null);setSelectedAnswer(null);return;
    }
    setActiveQuestion(null);setAnswerResult(null);
    void qc.invalidateQueries({queryKey:getGetTournamentsQueryKey()});
    void qc.invalidateQueries({queryKey:getGetTournamentLeaderboardQueryKey(activeId??'')});
  }
  useEffect(()=>{
    if(!activeQuestion||answerResult)return;
    let remaining=activeQuestion.timeRemainingSeconds;
    setSecondsLeft(remaining);
    const timer=window.setInterval(()=>{
      remaining=Math.max(0,remaining-1);
      setSecondsLeft(remaining);
      if(remaining===0)window.clearInterval(timer);
    },1000);
    return()=>window.clearInterval(timer);
  },[activeQuestion?.questionId,answerResult]);
  const formatTime=(value:number)=>`${Math.floor(value/60).toString().padStart(2,'0')}:${(value%60).toString().padStart(2,'0')}`;

  return <Content><PageHead kicker="Live arena" title="Play for the climb." copy="Join a free or paid event, then work through three server-timed rounds. A paid entry stays pending until its payment is verified."/>
    {notice&&<div className="error-banner" role="status">{notice}</div>}
    {isLoading?<Loading/>:isError?<LoadError retry={()=>void refetch()}/>:!data?.length?<div className="empty-state"><strong>The arena is between rounds</strong>New events will show up here when they open.</div>:<div style={{display:'grid',gap:13}}>{data.map(t=><article className="panel tournament-card" key={t.id}>
      <div><span className={`tag ${t.paid?'':'muted-tag'}`}>{t.paid?`Entry ${t.entryFeeEtb||50} ETB`:'Free entry'}</span>{t.completed&&<span className="tag" style={{marginLeft:7}}>COMPLETE</span>}
        <h3>{t.name}</h3><div className="tournament-stats"><span>SUBJECT<b>{t.subject}</b></span><span>PLAYERS<b>{t.participants.toLocaleString()} / {t.capacity}</b></span><span>PRIZE POOL<b>{t.prizePoolEtb.toLocaleString()} ETB</b></span><span>ROUNDS<b>{t.totalRounds} · E / C / A</b></span></div>
        {t.payoutBreakdown?.length>0&&<p className="muted" style={{fontSize:11,marginBottom:0}}>Rewards · {t.payoutBreakdown.join(' / ')}</p>}
      </div><div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
        <button className="btn btn-quiet" style={{padding:'9px 12px'}} onClick={()=>{setActiveId(t.id);setActiveQuestion(null);setAnswerResult(null);}} data-testid={`button-standings-${t.id}`}>Standings</button>
        <button className="btn btn-gold" onClick={()=>void enter(t)} disabled={join.isPending||startRound.isPending||t.isFull&&!t.joined} data-testid={`button-join-${t.id}`}>{join.isPending?'Opening checkout…':!t.joined?(t.paid?'Checkout · ETB 50':'Join free event'):t.completed?'View final board':'Start / resume'} <ArrowRight size={14}/></button>
      </div>
    </article>)}</div>}

    {activeId&&<section className="panel" style={{marginTop:16}}><div className="panel-title"><div><h2>{activeTournament?.name??'Tournament field'}</h2><small>{activeTournament?.joined?'YOUR ENTRY':'LIVE STANDINGS'}</small></div><button className="btn btn-quiet" style={{padding:'8px 10px'}} onClick={()=>{setActiveId(null);setActiveQuestion(null);setAnswerResult(null);}}>Close</button></div>
      {activeQuestion&&<div className="panel" style={{marginBottom:16,background:'#101014'}}>
        <div className="list-row" style={{paddingTop:0}}><div><div className="eyebrow">{activeQuestion.roundTitle} · {activeQuestion.rank}-Rank · Round {activeQuestion.roundNumber}/{activeQuestion.totalRounds}</div><strong>Question {activeQuestion.questionNumber} of {activeQuestion.totalQuestions}</strong></div><div className={`mono ${secondsLeft<60?'gold':''}`} style={{fontSize:20}}>{formatTime(secondsLeft)}</div></div>
        <p className="question">{activeQuestion.prompt}</p>
        <div>{activeQuestion.options.map((option,index)=><button key={`${activeQuestion.questionId}-${index}`} className={`option ${selectedAnswer===index?'chosen':''}`} disabled={Boolean(answerResult)||answerRound.isPending||secondsLeft===0} onClick={()=>void submitAnswer(index)} data-testid={`button-tournament-answer-${index}`}><span className="option-key">{String.fromCharCode(65+index)}</span>{option}</button>)}</div>
        {answerRound.isPending&&<p className="muted">The arena is scoring your answer…</p>}
        {secondsLeft===0&&!answerResult&&<button className="btn btn-quiet" onClick={()=>void checkExpiredRound()} disabled={startRound.isPending}>{startRound.isPending?'Checking the clock…':'Check expired round'}</button>}
        {answerResult&&<><div className="explanation"><strong>{answerResult.correct?'Correct move.':'The arena teaches, too.'}</strong> {answerResult.explanation}<div className="mono gold" style={{marginTop:7}}>+{answerResult.pointsAwarded} points · {answerResult.totalPoints} total · {answerResult.accuracy}% accuracy</div><div className="muted" style={{marginTop:7,fontSize:12}}>{answerResult.message}</div></div>
          <button className="btn btn-gold" style={{marginTop:10}} onClick={advance}>{answerResult.tournamentComplete?'View final standings':answerResult.roundComplete?'Start next round':'Next question'} <ArrowRight size={14}/></button></>}
      </div>}
      {!activeQuestion&&activeTournament?.joined&&!activeTournament.completed&&<div className="empty-state" style={{marginBottom:15}}><strong>Ready for your next round?</strong>Each round has its own five-minute clock. The server resumes your current round if you leave and return.<div><button className="btn btn-gold" style={{marginTop:12}} onClick={()=>void beginRound(activeTournament.id)} disabled={startRound.isPending}>{startRound.isPending?'Opening round…':'Start / resume round'} <ArrowRight size={14}/></button></div></div>}
      <div className="panel-title"><h2>Standings</h2><small>POINTS · SPEED · ACCURACY</small></div>
      {standings.isLoading?<Loading rows={2}/>:standings.isError?<LoadError retry={()=>void standings.refetch()}/>:!standings.data?.length?<div className="empty-state"><strong>No scores yet</strong>Finish a round to put your name on the board.</div>:<div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Position</th><th>Hunter</th><th>School</th><th>Points</th><th>Time</th><th>Accuracy</th><th>Badge</th></tr></thead><tbody>{standings.data.map(row=><tr key={`${row.position}-${row.name}`}><td className="rank-number">#{row.position.toString().padStart(2,'0')}</td><td><strong>{row.name}</strong></td><td>{row.school}</td><td className="mono gold">{row.points.toLocaleString()}</td><td>{formatTime(row.timeSeconds)}</td><td>{row.accuracy}%</td><td>{row.rankBadge??'—'}</td></tr>)}</tbody></table></div>}
    </section>}
  </Content>;
}

function LeaderboardPage(){
  const [subject,setSubject]=useState('');const params=useMemo(()=>subject?{subject}:undefined,[subject]);
  const {data,isLoading,isError,refetch}=useGetLeaderboards(params);
  return <Content><PageHead kicker="The hunter ranks" title="The climb is shared." copy="See how the field is moving. Your next run can change the board."/>
    <div className="panel"><div className="panel-title"><h2>Global leaderboard</h2><select value={subject} onChange={e=>setSubject(e.target.value)} aria-label="Filter by subject" style={{background:'#101014',color:'#ddd',border:'1px solid #343339',padding:9,borderRadius:5}}><option value="">All subjects</option>{fallbackSubjects.map(s=><option key={s}>{s}</option>)}</select></div>
    {isLoading?<Loading/>:isError?<LoadError retry={()=>void refetch()}/>:!data?.length?<div className="empty-state"><strong>A fresh board</strong>Leaderboard entries will appear once hunters finish their first runs.</div>:<div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>Position</th><th>Hunter</th><th>School</th><th>Rank</th><th>XP</th></tr></thead><tbody>{data.map(row=><tr key={`${row.position}-${row.name}`}><td className="rank-number">#{row.position.toString().padStart(2,'0')}</td><td><strong>{row.name}</strong></td><td>{row.school}</td><td><span className="tag">{row.hunterRank}</span></td><td className="mono gold">{row.xp.toLocaleString()}</td></tr>)}</tbody></table></div>}</div>
  </Content>;
}

function TeacherPage(){
  const {data:classes,isLoading,isError,refetch}=useGetClasses();const createClass=useCreateClass();const createAssignment=useCreateAssignment();const {data:subjects}=useGetSubjects();const {data:publishedAssignments,refetch:refetchAssignments}=useGetAssignments();const qc=useQueryClient();const [notice,setNotice]=useState('');const [assignment,setAssignment]=useState<{title:string;classId:string;subject:string;rank:string;dueAt:string}>({title:'',classId:'',subject:'',rank:'E',dueAt:''});
  const [activeClassId,setActiveClassId]=useState('');
  const roster=useGetClassStudents(activeClassId,{query:{enabled:Boolean(activeClassId),queryKey:getGetClassStudentsQueryKey(activeClassId)}});
  async function addClass(e:FormEvent<HTMLFormElement>){e.preventDefault();const fd=new FormData(e.currentTarget);setNotice('');try{await createClass.mutateAsync({data:{name:String(fd.get('name'))}});e.currentTarget.reset();qc.invalidateQueries({queryKey:getGetClassesQueryKey()});setNotice('Your class is ready. Share its join code with students.');}catch(err){setNotice(err instanceof Error?err.message:'Could not create the class.');}}
  async function addAssignment(e:FormEvent){e.preventDefault();setNotice('');try{await createAssignment.mutateAsync({data:{...assignment,rank:assignment.rank as 'E'|'D'|'C'|'B'|'A'|'S',dueAt:new Date(assignment.dueAt).toISOString()}});void qc.invalidateQueries({queryKey:getGetAssignmentsQueryKey()});void refetchAssignments();setAssignment(a=>({...a,title:''}));setNotice('Assignment published to the class.');}catch(err){setNotice(err instanceof Error?err.message:'Could not publish this assignment.');}}
  const classList=classes??[];
  return <Content><PageHead kicker="Teacher field kit" title="Your classes, in motion." copy="Create a class, share the join code, and set a focused dungeon assignment."/>
    {notice&&<div className="error-banner" role="status">{notice}</div>}
     <div className="grid-2"><section className="panel"><div className="panel-title"><h2>Your classes</h2><small>CLASS ROSTER</small></div>{isLoading?<Loading/>:isError?<LoadError retry={()=>void refetch()}/>:!classList.length?<div className="empty-state"><strong>Start your first class</strong>Give your students a shared place to grow.</div>:classList.map(c=><div className="list-row" key={c.id}><div><strong>{c.name}</strong><small>{c.studentCount} students · {c.averageMastery}% average mastery · <span className="class-code">{c.joinCode}</span></small></div><button className="btn btn-quiet" style={{padding:'8px 10px',flexShrink:0}} onClick={()=>setActiveClassId(c.id)} data-testid={`button-inspect-class-${c.id}`}>{activeClassId===c.id?'Viewing':'Inspect students'}</button></div>)}
      <form onSubmit={addClass} style={{display:'flex',gap:9,marginTop:18}}><input name="name" required minLength={2} placeholder="New class name" style={{flex:1,minWidth:0,background:'#0b0b0e',border:'1px solid #36353b',color:'#eee',borderRadius:6,padding:12}} data-testid="input-class-name"/><button className="btn btn-gold" disabled={createClass.isPending} data-testid="button-create-class">{createClass.isPending?'Creating…':'Create class'}</button></form>
    </section>
    <section className="panel"><div className="panel-title"><h2>Set an assignment</h2><small>NEW FIELD OBJECTIVE</small></div>{!classList.length?<div className="empty-state">Create a class before publishing an assignment.</div>:<form onSubmit={addAssignment}>
      <div className="field"><label>Assignment title</label><input required minLength={2} value={assignment.title} onChange={e=>setAssignment({...assignment,title:e.target.value})} placeholder="e.g. Vectors: the next level" data-testid="input-assignment-title"/></div>
      <div className="form-grid"><div className="field"><label>Class</label><select required value={assignment.classId} onChange={e=>setAssignment({...assignment,classId:e.target.value})}><option value="">Choose class</option>{classList.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="field"><label>Subject</label><select required value={assignment.subject} onChange={e=>setAssignment({...assignment,subject:e.target.value})}><option value="">Choose subject</option>{(subjects??fallbackSubjects.map(name=>({id:name,name,questionCount:0,mastery:0}))).map(s=><option key={s.id} value={s.name}>{s.name}</option>)}</select></div></div>
      <div className="form-grid"><div className="field"><label>Rank</label><select value={assignment.rank} onChange={e=>setAssignment({...assignment,rank:e.target.value})}>{ranks.map(r=><option key={r}>{r}</option>)}</select></div><div className="field"><label>Due date</label><input type="datetime-local" required value={assignment.dueAt} onChange={e=>setAssignment({...assignment,dueAt:e.target.value})}/></div></div>
      <button className="btn btn-gold" disabled={createAssignment.isPending} data-testid="button-create-assignment">{createAssignment.isPending?'Publishing…':'Publish assignment'} <ArrowRight size={14}/></button>
    </form>}</section></div>
    {activeClassId&&<section className="panel" style={{marginTop:16}}><div className="panel-title"><div><h2>Student mastery</h2><small>INDIVIDUAL SUBJECT MAPS</small></div><button className="btn btn-quiet" style={{padding:'8px 10px'}} onClick={()=>setActiveClassId('')}>Close roster</button></div>
      {roster.isLoading?<Loading rows={3}/>:roster.isError?<LoadError retry={()=>void roster.refetch()}/>:!roster.data?.length?<div className="empty-state"><strong>No students in this class yet</strong>When students join with the code, their mastery will appear here.</div>:<div style={{display:'grid',gap:12}}>{roster.data.map(student=><article key={student.id} className="panel" style={{padding:18,background:'#101014'}}><div className="list-row" style={{paddingTop:0}}><div><strong>{student.name}</strong><small>{student.school} · {student.hunterRank}-Rank</small></div><span className="mono gold">{student.xp.toLocaleString()} XP</span></div>
        {Object.entries(student.subjectMastery).length?Object.entries(student.subjectMastery).map(([subject,mastery])=><div className="subject-line" key={`${student.id}-${subject}`}><div><strong>{subject}</strong><div className="meter"><i style={{width:`${Math.max(0,Math.min(100,mastery))}%`}}/></div></div><small>{mastery}%</small></div>):<p className="muted" style={{fontSize:12}}>Subject mastery will appear after this student completes a run.</p>}
      </article>)}</div>}
    </section>}
    <section className="panel" style={{marginTop:16}}><div className="panel-title"><h2>Published assignments</h2><small>PERSISTED</small></div>{!publishedAssignments?.length?<div className="empty-state"><strong>No assignments published</strong>Assignments you publish will stay available here and in your students’ dashboards.</div>:publishedAssignments.map(a=><div className="list-row" key={a.id}><div><strong>{a.title}</strong><small>{a.className} · {a.subject} · {a.rank}-Rank</small></div><span className="muted">Due {new Date(a.dueAt).toLocaleString()}</span></div>)}</section>
  </Content>;
}

function SubscriptionPage(){
  const {data:current,isLoading,isError,refetch}=useGetSubscription();const {data:user}=useGetCurrentUser();const select=useSelectSubscription();const qc=useQueryClient();const [notice,setNotice]=useState('');
  useEffect(()=>{if(new URLSearchParams(window.location.search).has('checkout'))setNotice('Checkout returned. Access remains pending until the provider verifies payment.');},[]);
  async function choose(tier:'free'|'arena'|'institution'){setNotice('');try{const s=await select.mutateAsync({data:{tier}});qc.setQueryData(getGetSubscriptionQueryKey(),s);if(tier==='arena'){if(s.checkoutUrl){window.location.assign(s.checkoutUrl);return;}setNotice(`Verification pending · ${s.billingStatus}. Arena access is granted only after provider confirmation.`);return;}setNotice(`Your ${s.tier} plan selection is saved. Billing status: ${s.billingStatus}.`);}catch(e){setNotice(e instanceof Error?e.message:'Could not update your plan.');}}
  const plans=[{tier:'free' as const,name:'Free path',price:'0 ETB',detail:'Get in, get moving.',features:['Daily dungeon runs','Subject mastery map','Tutor game-master chat']},{tier:'arena' as const,name:'Arena Pass',price:current?.tier==='arena'&&current.priceEtb?`${current.priceEtb} ETB`:'Checkout price confirmed by Nexora',detail:'For hunters who want the full arena.',features:['Everything in Free','Tournament entry access','Expanded practice sessions'],featured:true},{tier:'institution' as const,name:'Institution',price:'School plan',detail:'A shared field for a school.',features:['Teacher class tools','Assignments and join codes','School-wide progress view']}].filter(p=>p.tier!=='institution'||user?.role==='teacher');
  return <Content><PageHead kicker="Choose your pace" title="Room to go further." copy="A plan should open doors—not add pressure. Start with the path that fits today."/>
    {isLoading?<Loading/>:isError?<LoadError retry={()=>void refetch()}/>:<div className="panel" style={{marginBottom:17}}><div className="panel-title"><h2>Current plan · <span className="gold">{current?.tier??'Free'}</span></h2><small>{current?.billingStatus??'READY'}</small></div><p className="muted">The checkout return never activates access by itself. Nexora verifies payment with the provider.</p><div className="payment-period"><span>Period ends <strong>{current?.currentPeriodEnd?new Date(current.currentPeriodEnd).toLocaleString():'Not active'}</strong></span><span>Grace ends <strong>{current?.graceEndsAt?new Date(current.graceEndsAt).toLocaleString():'No grace period'}</strong></span><span>Renewal due <strong>{current?.renewalDueAt?new Date(current.renewalDueAt).toLocaleString():'Not scheduled'}</strong></span></div><Link href="/payments" className="btn btn-quiet" style={{marginTop:15}}>View payment history <ArrowRight size={14}/></Link></div>}
    {notice&&<div className="error-banner" role="status">{notice}</div>}
    <div className="grid-3">{plans.map(p=><article className={`panel plan-card ${p.featured?'featured':''}`} key={p.tier}>{p.featured&&<span className="tag"><Crown size={11} style={{verticalAlign:'middle',marginRight:4}}/>ARENA ACCESS</span>}<h3>{p.name}</h3><p>{p.detail}</p><div className="price">{p.price}<small className="muted" style={{font:'11px var(--app-font-sans)'}}>{p.tier==='arena'?' · period details shown above':''}</small></div><ul>{p.features.map(f=><li key={f}>{f}</li>)}</ul><button className={p.featured?'btn btn-gold':'btn btn-quiet'} onClick={()=>void choose(p.tier)} disabled={select.isPending||current?.tier===p.tier} data-testid={`button-plan-${p.tier}`}>{current?.tier===p.tier?'Current plan':select.isPending?'Opening checkout…':p.tier==='institution'?'Choose institution':p.tier==='arena'?'Continue to secure checkout':'Select plan'} <ArrowRight size={14}/></button></article>)}</div>
  </Content>;
}

function AdminPage(){
  const {data:user}=useGetCurrentUser();
  const subjects=useGetSubjects();
  const tournaments=useGetTournaments();
  const leaderboard=useGetLeaderboards();
  const subjectList=subjects.data??[];
  const tournamentList=tournaments.data??[];
  const leaders=leaderboard.data??[];
  const loading=subjects.isLoading||tournaments.isLoading||leaderboard.isLoading;
  const failed=subjects.isError||tournaments.isError||leaderboard.isError;
  const retryAll=()=>{void subjects.refetch();void tournaments.refetch();void leaderboard.refetch();};
  const participants=tournamentList.reduce((sum,t)=>sum+t.participants,0);
  const pools=tournamentList.reduce((sum,t)=>sum+t.prizePoolEtb,0);
  return <Content><PageHead kicker="Nexora / Administration" title="Platform overview." copy={`Welcome, ${user?.name??'Admin'}. A concise read on the learning field and live arena.`}/>
    {failed&&<LoadError message="Some overview data could not be loaded." retry={retryAll}/>}
    {loading?<Loading rows={3}/>:<><div className="grid-3">
      <section className="panel"><div className="eyebrow">Learning map</div><div className="price">{subjectList.length}</div><p className="muted">Active EUEE subjects</p></section>
      <section className="panel"><div className="eyebrow">Live events</div><div className="price">{tournamentList.length}</div><p className="muted">{participants.toLocaleString()} joined · {pools.toLocaleString()} ETB in listed pools</p></section>
      <section className="panel"><div className="eyebrow">Hunter board</div><div className="price">{leaders.length}</div><p className="muted">Ranked hunters currently listed</p></section>
    </div>
    <div className="grid-2" style={{marginTop:16}}>
      <section className="panel"><div className="panel-title"><h2>Subject catalogue</h2><small>API SUBJECT VALUES</small></div>{subjectList.length?subjectList.map(s=><div key={s.id} className="list-row"><div><strong>{s.name}</strong><small>{s.questionCount} questions</small></div><span className="mono gold">{s.mastery}%</span></div>):<div className="empty-state"><strong>No subjects listed</strong>Subject data will appear when available.</div>}</section>
      <section className="panel"><div className="panel-title"><h2>Live arena</h2><small>TOURNAMENTS</small></div>{tournamentList.length?tournamentList.slice(0,5).map(t=><div key={t.id} className="list-row"><div><strong>{t.name}</strong><small>{t.subject} · {t.participants} participants</small></div><span className="mono gold">{t.prizePoolEtb.toLocaleString()} ETB</span></div>):<div className="empty-state"><strong>No open tournaments</strong>New events will be visible here.</div>}</section>
    </div></>}
  </Content>;
}

function Authenticated({children,roles}:{children:ReactNode;roles?:User['role'][]}){
  const {data:user,isLoading,isError,refetch}=useGetCurrentUser();const logout=useLogout();const qc=useQueryClient();const [,setLocation]=useLocation();
  const rolesKey=roles?.join('|')??'';
  const roleAllowed=!rolesKey||rolesKey.split('|').includes(user?.role??'');
  const redirectTarget=user?roleHome(user):'';
  useEffect(()=>{if(user&&!roleAllowed)setLocation(redirectTarget);},[user?.id,user?.role,roleAllowed,redirectTarget,setLocation]);
  async function signOut(){try{await logout.mutateAsync();qc.setQueryData(getGetCurrentUserQueryKey(),undefined);qc.clear();setLocation('/');}catch{/* keep the active session when sign-out fails */}}
  if(isLoading)return <div className="app-shell"><div className="app-top"><Brand/></div><Content><Loading rows={4}/></Content></div>;
  if(isError||!user)return <div className="app-shell"><Topbar/><main className="auth-wrap"><div className="auth-card"><div className="eyebrow">Your hunter profile</div><h1>Sign in to continue.</h1><p className="auth-sub">Your progress is attached to your secure account.</p><Link href="/login" className="btn btn-gold">Go to sign in <ArrowRight size={14}/></Link></div></main></div>;
  if(!roleAllowed)return <div className="app-shell"><Content><Loading rows={2}/><p className="muted">Taking you to your {user.role} workspace…</p></Content></div>;
  return <div className="app-shell noise"><AppNav user={user} onLogout={()=>void signOut()}/>{children}</div>;
}
function RoutedErrorBoundary({children}:{children:ReactNode}) { return <>{children}</>; }
function Router(){
  return <RoutedErrorBoundary><Switch>
    <Route path="/" component={Landing}/><Route path="/register"><AuthPage mode="register"/></Route><Route path="/login"><AuthPage mode="login"/></Route>
    <Route path="/onboarding"><Authenticated roles={STUDENT_ROLES}><Onboarding/></Authenticated></Route>
    <Route path="/app"><Authenticated roles={STUDENT_ROLES}><DashboardPage/></Authenticated></Route><Route path="/dungeon"><Authenticated roles={STUDENT_ROLES}><DungeonPage/></Authenticated></Route>
    <Route path="/event"><Authenticated roles={STUDENT_ROLES}><DetectiveEventPage/></Authenticated></Route>
    <Route path="/payments"><Authenticated roles={MEMBER_ROLES}><StudentPaymentsPage/></Authenticated></Route>
    <Route path="/tutor"><Authenticated roles={STUDENT_ROLES}><TutorPage/></Authenticated></Route><Route path="/tournaments"><Authenticated roles={STUDENT_ROLES}><TournamentsPage/></Authenticated></Route>
    <Route path="/leaderboard"><Authenticated><LeaderboardPage/></Authenticated></Route>
    <Route path="/teacher"><Authenticated roles={TEACHER_ROLES}><TeacherPage/></Authenticated></Route>
    <Route path="/admin"><Authenticated roles={ADMIN_ROLES}><AdminPage/></Authenticated></Route>
    <Route path="/admin/payments"><Authenticated roles={ADMIN_ROLES}><AdminPaymentsPage/></Authenticated></Route>
    <Route path="/subscription"><Authenticated roles={MEMBER_ROLES}><SubscriptionPage/></Authenticated>
    </Route><Route component={NotFound}/>
  </Switch></RoutedErrorBoundary>;
}
function App(){
  return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,'')}><Router/></WouterRouter></QueryClientProvider>;
}
export default App;
