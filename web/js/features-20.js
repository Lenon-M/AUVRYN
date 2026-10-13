/* AUVRYN 1.11.2 — Memory Engine + Study Circles + AUVRYN Assistant
 * Loaded before app.js. app.js calls AUVRYN_FEATURES_BOOT after defining the core.
 */
window.AUVRYN_FEATURES_BOOT = function () {
  'use strict';

  const FEATURE_VERSION = '1.11.2';
  const ACTIVE_STUDY_KEY = 'auvryn-active-study-circle-v1';
  const circleCache = { study: null, details: new Map(), loading: new Set(), ownerUid: '', generation: 0 };
  let circleUnsubs = [];

  function tsNow() { return new Date().toISOString(); }
  function compactName(s='') { return String(s).trim().replace(/\s+/g,' ').slice(0,80); }
  function currentFirebaseUser() { return getFirebaseAuth()?.currentUser || null; }
  function communityReady() { return !!(currentFirebaseUser() && getFirestore() && firebaseEmailVerified()); }
  function serverTs() { return firebase.firestore.FieldValue.serverTimestamp(); }
  function circleErr(e, fallback='Não foi possível concluir agora.') {
    console.warn('AUVRYN Circles:', e);
    const code=String(e?.code||'');
    if(code.includes('permission-denied')) return toast('Permissão negada. Publique as regras Firestore da versão 1.11.2 no Firebase.');
    if(code.includes('unavailable')) return toast('Firebase indisponível agora. Tente novamente quando estiver online.');
    toast(fallback);
  }
  function userProfile() {
    const u=currentFirebaseUser(), a=authRecord();
    return {uid:u?.uid||'', name:compactName(u?.displayName||a?.name||state.settings.name||'Usuário'), photoURL:u?.photoURL||a?.photoURL||'', email:u?.email||a?.email||''};
  }
  function generateInviteCode() {
    const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out='';
    const bytes=new Uint32Array(7);
    try{crypto.getRandomValues(bytes)}catch(e){for(let i=0;i<7;i++)bytes[i]=Math.floor(Math.random()*1e9)}
    for(let i=0;i<7;i++)out+=chars[bytes[i]%chars.length];
    return out;
  }
  function stopCircleListeners(){circleUnsubs.forEach(fn=>{try{fn()}catch(e){}});circleUnsubs=[]}
  function syncCircleAccount(){
    const uid=currentFirebaseUser()?.uid||'';
    if(circleCache.ownerUid!==uid){
      circleCache.ownerUid=uid;circleCache.generation++;
      circleCache.study=null;circleCache.details.clear();circleCache.loading.clear();stopCircleListeners();
    }
    return {uid,generation:circleCache.generation};
  }
  window.addEventListener('beforeunload',stopCircleListeners);

  // ---------- MEMORY ENGINE ----------
  function initialIntervalForSummary(s){return s.confidence==='Alta'?7:s.confidence==='Baixa'?1:3}
  function ensureMemorySummary(s){
    if(!s) return false;
    let changed=false;
    if(!Number.isFinite(Number(s.reviewEase))){s.reviewEase=2.3;changed=true}
    if(!Number.isFinite(Number(s.reviewInterval))||Number(s.reviewInterval)<1){s.reviewInterval=initialIntervalForSummary(s);changed=true}
    if(!Number.isFinite(Number(s.reviewCount))){s.reviewCount=0;changed=true}
    if(!Array.isArray(s.reviewHistory)){s.reviewHistory=[];changed=true}
    if(!s.nextReview){s.nextReview=addDays(s.lastReview||s.updated||today(),Number(s.reviewInterval)||initialIntervalForSummary(s));changed=true}
    return changed;
  }
  function ensureMemoryAll(){let changed=false;state.summaries.forEach(s=>{if(ensureMemorySummary(s))changed=true});if(changed){localStorage.setItem(KEY,JSON.stringify(state));markCloudLocalChange();scheduleCloudPush()}}
  function examUrgency(s){
    const exams=state.exams.filter(e=>e.discipline&&s.discipline&&e.discipline.toLowerCase()===s.discipline.toLowerCase()&&e.date>=today()).sort((a,b)=>a.date.localeCompare(b.date));
    if(!exams.length)return 0;const d=daysBetween(today(),exams[0].date);return d<=3?5:d<=7?3:d<=14?1:0;
  }
  function memoryPriority(s){ensureMemorySummary(s);const overdue=Math.max(0,-daysBetween(today(),s.nextReview));const accuracyPenalty=Math.max(0,(80-Number(s.accuracy||0))/10);return overdue*3+accuracyPenalty+examUrgency(s)}
  function dueMemorySummaries(date=today()){ensureMemoryAll();return state.summaries.filter(s=>(s.nextReview||date)<=date).sort((a,b)=>memoryPriority(b)-memoryPriority(a)||(a.nextReview||'').localeCompare(b.nextReview||''))}
  function upcomingMemorySummaries(days=14){ensureMemoryAll();const end=addDays(today(),days);return state.summaries.filter(s=>s.nextReview>today()&&s.nextReview<=end).sort((a,b)=>a.nextReview.localeCompare(b.nextReview))}
  function memoryRatingLabel(q){return {again:'Esqueci',hard:'Difícil',good:'Lembrei',easy:'Muito fácil'}[q]||q}
  function memoryNextInterval(s,q){
    ensureMemorySummary(s);
    const count=Math.max(0,Number(s.reviewCount||0)), current=Math.max(1,Number(s.reviewInterval)||1);
    if(q==='again')return 1;
    if(q==='hard'){const ladder=[1,2,4,7,12,20,30,45,70,100,140,180];return clamp(count<ladder.length?ladder[count]:Math.round(current*1.35),1,180)}
    if(q==='good'){const ladder=[2,5,12,25,45,75,120,180];return clamp(count<ladder.length?ladder[count]:Math.round(current*1.8),1,180)}
    if(q==='easy'){const ladder=[2,7,21,45,90,150,180];return clamp(count<ladder.length?ladder[count]:Math.round(current*2.2),1,180)}
    return current;
  }
  function memoryIntervalHint(s,q){const d=memoryNextInterval(s,q);return d===1?'amanhã':`em ${d}d`}
  function memoryRate(id,q){
    const s=byId(state.summaries,id);if(!s)return;ensureMemorySummary(s);
    let ease=clamp(Number(s.reviewEase)||2.3,1.3,3.2), interval=memoryNextInterval(s,q);
    if(q==='again')ease=clamp(ease-.2,1.3,3.2);
    else if(q==='hard')ease=clamp(ease-.1,1.3,3.2);
    else if(q==='easy')ease=clamp(ease+.08,1.3,3.2);
    s.lastReview=today();s.nextReview=addDays(today(),interval);s.reviewInterval=interval;s.reviewEase=Number(ease.toFixed(2));s.reviewCount=Number(s.reviewCount||0)+1;
    s.reviewHistory=[...(s.reviewHistory||[]),{date:today(),rating:q,interval}].slice(-60);
    if(q==='again')s.confidence='Baixa';else if(q==='easy'&&s.reviewCount>2)s.confidence='Alta';else if(q==='good'&&s.confidence==='Baixa')s.confidence='Média';
    save();render();toast(`${memoryRatingLabel(q)} · próxima revisão em ${interval} dia${interval===1?'':'s'}`);
  }
  function memoryScheduleView(){
    ensureMemoryAll();const items=state.summaries.slice().sort((a,b)=>(a.nextReview||'').localeCompare(b.nextReview||''));
    const groups=new Map();items.forEach(s=>{const d=s.nextReview||today();if(!groups.has(d))groups.set(d,[]);groups.get(d).push(s)});
    const dates=[...groups.keys()].filter(d=>d<=addDays(today(),45)).slice(0,18);
    return `<section class="grid grid-4 memory-metrics">${metric('Hoje',dueMemorySummaries().length,'conteúdos para revisar')}${metric('Próx. 7 dias',upcomingMemorySummaries(7).length,'revisões agendadas')}${metric('Revisados',state.summaries.reduce((a,s)=>a+Number(s.reviewCount||0),0),'sessões registradas')}${metric('Intervalo médio',Math.round(state.summaries.reduce((a,s)=>a+Number(s.reviewInterval||1),0)/Math.max(1,state.summaries.length))+' d','adapta-se ao desempenho')}</section><section class="section card"><div class="card-head"><div><h3>Cronograma de memória</h3><small>O AUVRYN espaça as revisões e ajusta o próximo intervalo conforme sua lembrança.</small></div><span class="pill accent">até 45 dias</span></div><div class="memory-calendar">${dates.length?dates.map(d=>`<div class="memory-day ${d<today()?'overdue':d===today()?'today':''}"><div class="memory-day-date"><b>${d===today()?'Hoje':fmtDate(d,{weekday:'short',day:'2-digit',month:'short'})}</b><small>${groups.get(d).length} revisão${groups.get(d).length===1?'':'ões'}</small></div><div class="memory-day-items">${groups.get(d).map(s=>`<button data-memory-open="${s.id}"><span>${esc(s.title)}</span><small>${esc(s.discipline||'Sem disciplina')}</small></button>`).join('')}</div></div>`).join(''):'<div class="empty">Nenhuma revisão agendada.</div>'}</div></section>`
  }
  function memoryQueueView(){
    const due=dueMemorySummaries(), upcoming=upcomingMemorySummaries(10);
    return `<section class="grid grid-4 memory-metrics">${metric('Para hoje',due.length,'revisões vencidas ou de hoje')}${metric('Esta semana',upcomingMemorySummaries(7).length,'próximas')}${metric('Conteúdos',state.summaries.length,'no motor de memória')}${metric('Em dia',state.summaries.length-due.length,'sem revisão atrasada')}</section><section class="section grid grid-2 memory-layout"><article class="card"><div class="card-head"><div><h3>Fila inteligente</h3><small>Prioridade por atraso, desempenho e proximidade de prova.</small></div><button class="text-btn" data-review-tab="schedule">Ver cronograma →</button></div><div class="memory-list">${due.length?due.map(s=>`<article class="memory-review-card"><div class="memory-review-main"><div><span class="pill ${s.nextReview<today()?'red':'accent'}">${s.nextReview<today()?'atrasada':'hoje'}</span><h4>${esc(s.title)}</h4><p>${esc(s.discipline||'')} · intervalo atual ${s.reviewInterval||1}d${examUrgency(s)?' · prova próxima':''}</p></div><button class="secondary-btn compact" data-memory-open="${s.id}">Abrir conteúdo</button></div><div class="memory-recall"><small>Depois de tentar lembrar sem consultar:</small><div class="memory-rate-buttons"><button data-memory-rate="again" data-id="${s.id}"><span>Esqueci</span><small>${memoryIntervalHint(s,'again')}</small></button><button data-memory-rate="hard" data-id="${s.id}"><span>Difícil</span><small>${memoryIntervalHint(s,'hard')}</small></button><button data-memory-rate="good" data-id="${s.id}"><span>Lembrei</span><small>${memoryIntervalHint(s,'good')}</small></button><button data-memory-rate="easy" data-id="${s.id}"><span>Muito fácil</span><small>${memoryIntervalHint(s,'easy')}</small></button></div></div></article>`).join(''):'<div class="empty success-empty">✓ Nenhuma revisão vencida hoje. O próximo contato aparece automaticamente.</div>'}</div></article><article class="card"><div class="card-head"><div><h3>Próximas revisões</h3><small>o algoritmo aumenta ou reduz os intervalos conforme sua resposta</small></div></div><div class="list">${upcoming.length?upcoming.map(s=>`<div class="row"><div class="row-main"><b>${esc(s.title)}</b><small>${fmtDate(s.nextReview,{weekday:'short',day:'2-digit',month:'short'})} · ${esc(s.discipline||'')}</small></div><span class="pill">${s.reviewInterval||1}d</span></div>`).join(''):'<div class="empty">Nada agendado nos próximos 10 dias.</div>'}</div><div class="separator"></div><div class="insight-callout"><b>Recuperação ativa antes da releitura</b><p>Tente explicar o tema sem consultar, responda questões/flashcards e só então volte ao material. O AUVRYN usa sua percepção de dificuldade para marcar o próximo contato.</p></div></article></section>`
  }

  const baseReviewsView=reviewsView;
  reviewsView=function(){
    const sub=state.ui.reviewTab||'queue';const subtabs=[['queue','Fila inteligente'],['schedule','Cronograma'],['files','PDFs & arquivos'],['flashcards','Flashcards'],['questions','Questões']];
    return `<div class="review-hub-head"><div><h3>Revisões</h3><p>Revisão espaçada, recuperação ativa, PDFs, flashcards e questões no mesmo fluxo.</p></div><span class="pill accent">${dueMemorySummaries().length} para hoje</span></div><div class="tabs nested-tabs">${subtabs.map(([k,n])=>`<button class="tab ${sub===k?'active':''}" data-review-tab="${k}">${n}</button>`).join('')}</div>${sub==='schedule'?memoryScheduleView():sub==='files'?reviewFilesView():sub==='flashcards'?flashcardsView():sub==='questions'?questionsView():memoryQueueView()}`;
  };
  reviewQueueView=memoryQueueView;

  // ---------- CIRCLES / FIRESTORE ----------
  function circleRoot(id){return getFirestore()?.collection('circles').doc(String(id))||null}
  function myCircleMembershipsRef(){const u=currentFirebaseUser();return u?getFirestore()?.collection('users').doc(u.uid).collection('circleMemberships'):null}
  async function loadMyCircles(type,force=false){
    if(!communityReady())return [];
    const token=syncCircleAccount(),key='list:'+type;
    if(circleCache[type]&&!force)return circleCache[type];
    if(circleCache.loading.has(key))return circleCache[type]||[];
    circleCache.loading.add(key);
    try{
      const ref=myCircleMembershipsRef();if(!ref)return [];
      const snap=await ref.get();
      if(currentFirebaseUser()?.uid!==token.uid||circleCache.generation!==token.generation)return [];
      const rows=[],docs=snap.docs.filter(d=>(d.data()?.type||'study')===type);
      for(const d of docs){
        if(currentFirebaseUser()?.uid!==token.uid||circleCache.generation!==token.generation)return [];
        try{const c=await circleRoot(d.id).get();if(c.exists)rows.push({id:c.id,...d.data(),...c.data(),membership:d.data()})}catch(e){console.warn('AUVRYN Circle membership:',d.id,e?.code||e)}
      }
      if(currentFirebaseUser()?.uid!==token.uid||circleCache.generation!==token.generation)return [];
      rows.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
      const active=activeStudyLocal();if(active&&active.circleId&&!rows.some(x=>x.id===active.circleId))localStorage.removeItem(ACTIVE_STUDY_KEY);
      circleCache[type]=rows;return rows;
    }finally{circleCache.loading.delete(key)}
  }
  async function loadCircleDetails(id,force=false){
    if(!communityReady()||!id)return null;
    const token=syncCircleAccount();
    if(circleCache.details.has(id)&&!force)return circleCache.details.get(id);
    const root=circleRoot(id);if(!root)return null;
    const [circleSnap,membersSnap,sessionsSnap,postsSnap,challengesSnap,filesSnap]=await Promise.all([
      root.get(),
      root.collection('members').get(),
      root.collection('sessions').orderBy('clientTime','desc').limit(200).get(),
      root.collection('posts').orderBy('clientTime','desc').limit(100).get(),
      root.collection('challenges').orderBy('clientTime','desc').limit(50).get(),
      root.collection('files').orderBy('clientTime','desc').limit(100).get()
    ]);
    if(currentFirebaseUser()?.uid!==token.uid||circleCache.generation!==token.generation)return null;
    if(!circleSnap.exists)return null;
    const unpack=s=>s.docs.map(d=>({id:d.id,...d.data()}));
    const details={id,...circleSnap.data(),members:unpack(membersSnap),sessions:unpack(sessionsSnap),posts:unpack(postsSnap),challenges:unpack(challengesSnap),files:unpack(filesSnap)};
    details.sessions.sort((a,b)=>String(b.createdAt?.toDate?.()?.toISOString?.()||b.createdAt||'').localeCompare(String(a.createdAt?.toDate?.()?.toISOString?.()||a.createdAt||'')));
    details.posts.sort((a,b)=>Number(b.clientTime||0)-Number(a.clientTime||0));
    details.files.sort((a,b)=>Number(b.clientTime||0)-Number(a.clientTime||0));
    circleCache.details.set(id,details);return details;
  }
  function invalidateCircle(type,id){if(type)circleCache[type]=null;if(id)circleCache.details.delete(id)}
  function validSharedUrl(raw='') {
    try {
      const u=new URL(String(raw||'').trim());
      return /^https?:$/.test(u.protocol) ? u.toString() : '';
    } catch(e) { return ''; }
  }
  async function addStudyCircleLink(circleId,name,url,note=''){
    if(!communityReady())return;
    name=compactName(name||'Material');
    const safeUrl=validSharedUrl(url);
    note=String(note||'').trim().slice(0,280);
    if(!name)return toast('Dê um nome ao material.');
    if(!safeUrl)return toast('Cole um link válido começando com http:// ou https://.');
    const root=circleRoot(circleId),u=userProfile(),ref=root.collection('files').doc();
    try{
      const batch=getFirestore().batch();
      batch.set(ref,{kind:'study_link',uploaderId:u.uid,uploaderName:u.name,photoURL:u.photoURL,name,url:safeUrl,note,createdAt:serverTs(),clientTime:Date.now()});
      batch.set(root.collection('posts').doc(),{authorId:u.uid,authorName:u.name,photoURL:u.photoURL,text:`Compartilhou ${name}`,kind:'link',fileId:ref.id,createdAt:serverTs(),clientTime:Date.now()});
      await batch.commit();invalidateCircle('study',circleId);closeCircleDialogs();await refreshVisibleCircle(circleId);toast('Material compartilhado com o grupo.');
    }catch(e){circleErr(e,'Não foi possível compartilhar o material.')}
  }
  async function deleteStudyCircleFile(circleId,fileId){
    const d=await loadCircleDetails(circleId,true),f=d?.files?.find(x=>x.id===fileId),me=userProfile();if(!f)return;
    if(f.uploaderId!==me.uid&&d.ownerId!==me.uid)return toast('Somente quem compartilhou ou quem criou o grupo pode remover.');
    if(!confirm(`Remover “${f.name}” do grupo?`))return;
    try{await circleRoot(circleId).collection('files').doc(fileId).delete();invalidateCircle('study',circleId);await refreshVisibleCircle(circleId);toast('Material removido.')}catch(e){circleErr(e,'Não foi possível remover o material.')}
  }
  async function createCircle(type,name,description=''){
    type='study';
    if(!communityReady())return toast('Entre com Google ou e-mail verificado para criar grupos.');
    name=compactName(name);if(name.length<3)return toast('Dê um nome com pelo menos 3 caracteres.');
    const db=getFirestore(),u=userProfile(),root=db.collection('circles').doc(),code=generateInviteCode();
    const circle={name,type,description:String(description||'').trim().slice(0,280),ownerId:u.uid,ownerName:u.name,inviteCode:code,archived:false,archivedAt:null,createdAt:serverTs(),clientCreatedAt:Date.now(),version:2};
    try{
      await root.set(circle);
      const batch=db.batch();
      batch.set(root.collection('members').doc(u.uid),{userId:u.uid,name:u.name,photoURL:u.photoURL,role:'owner',inviteCode:code,joinedAt:serverTs(),activeStudy:null});
      batch.set(db.collection('users').doc(u.uid).collection('circleMemberships').doc(root.id),{circleId:root.id,type,name,role:'owner',joinedAt:serverTs()});
      batch.set(db.collection('circleInvites').doc(code),{circleId:root.id,type,name,ownerId:u.uid,ownerName:u.name,active:true,createdAt:serverTs()});
      await batch.commit();
      invalidateCircle('study',root.id);state.ui.studyCircleId=root.id;save();closeCircleDialogs();toast(`Grupo criado · código ${code}`);render();
    }catch(e){try{await root.delete()}catch(_){}circleErr(e,'Não foi possível criar o grupo.')}
  }
  async function joinCircle(code){
    if(!communityReady())return toast('Entre com uma conta verificada para participar de grupos.');
    code=String(code||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');if(code.length<5)return toast('Digite o código do grupo.');
    const db=getFirestore(),u=userProfile();
    try{
      const inv=await db.collection('circleInvites').doc(code).get();if(!inv.exists||inv.data()?.active===false)return toast('Código de convite não encontrado ou inativo.');
      const info=inv.data();if((info.type||'study')!=='study')return toast('Esse tipo de grupo não faz mais parte do AUVRYN.');const circleId=info.circleId,type='study',root=db.collection('circles').doc(circleId),batch=db.batch();
      batch.set(root.collection('members').doc(u.uid),{userId:u.uid,name:u.name,photoURL:u.photoURL,role:'member',inviteCode:code,joinedAt:serverTs(),activeStudy:null},{merge:true});
      batch.set(db.collection('users').doc(u.uid).collection('circleMemberships').doc(circleId),{circleId,type,name:info.name||'Grupo',role:'member',joinedAt:serverTs()},{merge:true});
      await batch.commit();invalidateCircle('study',circleId);state.ui.studyCircleId=circleId;save();closeCircleDialogs();toast('Você entrou no grupo.');render();
    }catch(e){circleErr(e,'Não foi possível entrar no grupo.')}
  }
  async function leaveCircle(type,id){
    if(!communityReady())return;const u=userProfile(),d=await loadCircleDetails(id,true);if(d?.ownerId===u.uid)return toast('O criador não pode sair sem transferir ou encerrar o grupo.');
    if(!confirm('Sair deste grupo?'))return;
    try{const db=getFirestore(),batch=db.batch();batch.delete(circleRoot(id).collection('members').doc(u.uid));batch.delete(db.collection('users').doc(u.uid).collection('circleMemberships').doc(id));await batch.commit();invalidateCircle('study',id);state.ui.studyCircleId='';save();render();toast('Você saiu do grupo.')}catch(e){circleErr(e)}
  }
  async function updateCircleSettings(id,name,description=''){
    if(!communityReady())return;const d=await loadCircleDetails(id,true),u=userProfile();if(!d||d.ownerId!==u.uid)return toast('Somente quem criou o grupo pode editar.');
    name=compactName(name);description=String(description||'').trim().slice(0,280);if(name.length<3)return toast('Use pelo menos 3 caracteres no nome.');
    try{const db=getFirestore(),batch=db.batch(),root=circleRoot(id);batch.update(root,{name,description,updatedAt:serverTs()});if(d.inviteCode)batch.set(db.collection('circleInvites').doc(d.inviteCode),{name},{merge:true});await batch.commit();invalidateCircle('study',id);circleCache.study=null;closeCircleDialogs();await loadMyCircles('study',true);await refreshVisibleCircle(id);toast('Configurações do grupo atualizadas.')}catch(e){circleErr(e,'Não foi possível atualizar o grupo.')}
  }
  async function setCircleArchived(id,archived){
    if(!communityReady())return;const d=await loadCircleDetails(id,true),u=userProfile();if(!d||d.ownerId!==u.uid)return toast('Somente quem criou o grupo pode arquivar.');
    const verb=archived?'Arquivar':'Reativar';if(!confirm(`${verb} “${d.name}”?${archived?' O grupo ficará somente para consulta até ser reativado.':''}`))return;
    try{const db=getFirestore(),batch=db.batch(),root=circleRoot(id);batch.update(root,{archived:!!archived,archivedAt:archived?serverTs():null,updatedAt:serverTs()});if(d.inviteCode)batch.set(db.collection('circleInvites').doc(d.inviteCode),{active:!archived},{merge:true});if(archived)(d.members||[]).forEach(m=>{if(m.userId)batch.set(root.collection('members').doc(m.userId),{activeStudy:null},{merge:true})});await batch.commit();const active=activeStudyLocal();if(archived&&active?.circleId===id)localStorage.removeItem(ACTIVE_STUDY_KEY);invalidateCircle('study',id);circleCache.study=null;state.ui.studyCircleId='';state.ui.studyCirclePanel='room';save();closeCircleDialogs();await loadMyCircles('study',true);render();toast(archived?'Grupo arquivado.':'Grupo reativado.')}catch(e){circleErr(e,archived?'Não foi possível arquivar o grupo.':'Não foi possível reativar o grupo.')}
  }
  async function deleteRefsInChunks(db,refs){
    for(let i=0;i<refs.length;i+=400){const batch=db.batch();refs.slice(i,i+400).forEach(ref=>batch.delete(ref));await batch.commit()}
  }
  async function deleteCirclePermanently(id){
    if(!communityReady())return;const d=await loadCircleDetails(id,true),u=userProfile();if(!d||d.ownerId!==u.uid)return toast('Somente quem criou o grupo pode excluir.');
    const typed=prompt(`Excluir “${d.name}” permanentemente?

Isso apaga chat, sessões, desafios e materiais compartilhados para todos.

Digite o nome do grupo para confirmar:`,'');
    if(typed===null)return;if(String(typed).trim()!==String(d.name||'').trim())return toast('O nome não confere. O grupo não foi excluído.');
    try{
      const db=getFirestore(),root=circleRoot(id),refs=[];
      for(const col of ['posts','sessions','challenges','files','members']){const snap=await root.collection(col).get();snap.docs.forEach(x=>refs.push(x.ref))}
      (d.members||[]).forEach(m=>{if(m.userId)refs.push(db.collection('users').doc(m.userId).collection('circleMemberships').doc(id))});
      if(d.inviteCode)refs.push(db.collection('circleInvites').doc(d.inviteCode));
      await deleteRefsInChunks(db,refs);await root.delete();
      const active=activeStudyLocal();if(active?.circleId===id)localStorage.removeItem(ACTIVE_STUDY_KEY);
      stopCircleListeners();invalidateCircle('study',id);circleCache.study=null;state.ui.studyCircleId='';state.ui.studyCirclePanel='room';save();closeCircleDialogs();await loadMyCircles('study',true);render();toast('Grupo excluído permanentemente.');
    }catch(e){circleErr(e,'Não foi possível excluir o grupo completamente.')}
  }
  async function postCircleMessage(circleId,text){
    if(!communityReady())return;text=String(text||'').trim();if(!text)return;if(text.length>600)return toast('Mensagem muito longa. Use até 600 caracteres.');
    const u=userProfile();try{await circleRoot(circleId).collection('posts').add({authorId:u.uid,authorName:u.name,photoURL:u.photoURL,text,kind:'message',createdAt:serverTs(),clientTime:Date.now()});invalidateCircle(null,circleId);await refreshVisibleCircle(circleId)}catch(e){circleErr(e,'Não foi possível enviar a mensagem.')}
  }
  function activeStudyLocal(){try{const x=JSON.parse(localStorage.getItem(ACTIVE_STUDY_KEY)||'null');const u=currentFirebaseUser();return x&&u&&x.userId===u.uid?x:null}catch(e){return null}}
  async function startStudyCircleSession(circleId,subject){
    if(!communityReady())return;const existing=activeStudyLocal();if(existing&&existing.circleId!==circleId)return toast('Finalize sua sessão atual antes de entrar em outro Study Circle.');subject=compactName(subject||'Sessão de estudo');const u=userProfile(),payload={circleId,subject,startedAt:Date.now(),userId:u.uid};
    try{await circleRoot(circleId).collection('members').doc(u.uid).set({activeStudy:{subject,startedAt:payload.startedAt},name:u.name,photoURL:u.photoURL},{merge:true});localStorage.setItem(ACTIVE_STUDY_KEY,JSON.stringify(payload));closeCircleDialogs();invalidateCircle(null,circleId);render();toast('Sessão em grupo iniciada.')}catch(e){circleErr(e,'Não foi possível iniciar a sessão.')}
  }
  async function stopStudyCircleSession(){
    const active=activeStudyLocal();if(!active||!communityReady())return;const u=userProfile(),minutes=clamp(Math.max(1,Math.round((Date.now()-Number(active.startedAt||Date.now()))/60000)),1,360),root=circleRoot(active.circleId);
    try{const batch=getFirestore().batch(),sessionRef=root.collection('sessions').doc(),memberRef=root.collection('members').doc(u.uid);batch.set(sessionRef,{userId:u.uid,name:u.name,photoURL:u.photoURL,subject:active.subject||'Estudo',minutes,date:today(),createdAt:serverTs(),clientTime:Date.now()});batch.set(memberRef,{activeStudy:null,lastStudyAt:serverTs()},{merge:true});await batch.commit();localStorage.removeItem(ACTIVE_STUDY_KEY);state.focus.push({id:uid(),date:today(),minutes,area:'Faculdade'});save();invalidateCircle('study',active.circleId);render();toast(`${minutes} min registrados no Study Circle`)}catch(e){circleErr(e,'Não foi possível finalizar a sessão.')}
  }
  async function addCircleChallenge(circleId,type,title,target,endDate){
    if(!communityReady())return;type='study';title=compactName(title);target=clamp(Number(target)||1,1,100000);if(!title)return toast('Dê um nome ao desafio.');const u=userProfile();
    try{await circleRoot(circleId).collection('challenges').add({creatorId:u.uid,creatorName:u.name,type:'study',title,target,startDate:today(),endDate:endDate||addDays(today(),7),kind:'standard',createdAt:serverTs(),clientTime:Date.now()});invalidateCircle('study',circleId);closeCircleDialogs();await refreshVisibleCircle(circleId);toast('Desafio criado.')}catch(e){circleErr(e,'Não foi possível criar o desafio.')}
  }
  function studyRanking(details,range=7){
    const start=addDays(today(),-(range-1)),by={};details.members.forEach(m=>by[m.userId]={userId:m.userId,name:m.name||'Usuário',photoURL:m.photoURL||'',minutes:0,sessions:0,score:0});
    const daily={};details.sessions.filter(s=>s.date>=start&&s.date<=today()).forEach(s=>{if(!by[s.userId])by[s.userId]={userId:s.userId,name:s.name||'Usuário',photoURL:s.photoURL||'',minutes:0,sessions:0,score:0};by[s.userId].minutes+=Number(s.minutes||0);by[s.userId].sessions++;const k=s.userId+'|'+s.date;daily[k]=(daily[k]||0)+Number(s.minutes||0)});
    Object.values(by).forEach(x=>{let capped=0;Object.entries(daily).forEach(([k,v])=>{if(k.startsWith(x.userId+'|'))capped+=Math.min(180,v)});x.score=Math.round(capped/5+x.sessions*2)});return Object.values(by).sort((a,b)=>b.score-a.score||b.minutes-a.minutes)
  }
  function memberAvatar(x){return x.photoURL?`<img src="${esc(x.photoURL)}" alt="${esc(x.name||'Usuário')}">`:`<span>${esc((x.name||'U').charAt(0).toUpperCase())}</span>`}
  function activeMembers(details){const now=Date.now();return details.members.filter(m=>m.activeStudy?.startedAt&&now-Number(m.activeStudy.startedAt)<4*60*60*1000)}
  function circleChallengeCard(c,details,type){
    const end=c.endDate||today(),done=end<today(),target=Math.max(1,Number(c.target)||1);
    const total=details.sessions.filter(s=>s.date>=c.startDate&&s.date<=end).reduce((a,s)=>a+Number(s.minutes||0),0);
    const label=`${total}/${target} min`,p=Math.min(100,Math.round(total/target*100));
    return `<article class="circle-challenge"><div><span class="pill ${done?'':'accent'}">${done?'encerrado':'desafio'}</span><b>${esc(c.title)}</b><small>até ${fmtDate(end,{day:'2-digit',month:'short'})} · ${label}</small></div><div class="progress"><i style="width:${p}%"></i></div></article>`
  }
  function renderCircleList(type,rows){
    const activeRows=rows.filter(c=>!c.archived),archivedRows=rows.filter(c=>c.archived);
    const cards=list=>`<div class="circle-grid">${list.map(c=>`<button class="circle-card ${c.archived?'is-archived':''}" data-circle-open="${c.id}" data-circle-type="study"><div class="circle-card-icon">${c.archived?'◇':'◫'}</div><div><b>${esc(c.name)}</b><small>${c.archived?'Arquivado · ':''}${esc(c.description||'Grupo de estudos')}</small></div><span>→</span></button>`).join('')}</div>`;
    return `<section class="circle-intro"><div><span class="eyebrow">Study Circles</span><h3>Estude com outras pessoas sem transformar isso em pressão.</h3><p>Crie grupos privados, acompanhe sessões, converse, faça desafios e compare constância.</p></div><div class="head-actions"><button class="secondary-btn" data-circle-join="study">Entrar com código</button><button class="primary-btn" data-circle-create="study">＋ Criar grupo</button></div></section><div class="circle-preview-grid"><article><span>●</span><b>Sala ao vivo</b><small>Veja quem está estudando e o tema atual.</small></article><article><span>↗</span><b>Ranking saudável</b><small>Tempo com limite diário + constância.</small></article><article><span>◇</span><b>Desafios</b><small>Metas coletivas entre amigos, com prazo e progresso.</small></article><article><span>◌</span><b>Conversa</b><small>Chat privado para combinar sessões e incentivar o grupo.</small></article></div>${activeRows.length?cards(activeRows):`<div class="card empty circle-empty">Você não tem grupos ativos. Crie um ou entre com o código de um amigo.</div>`}${archivedRows.length?`<details class="card circle-archive-box"><summary><b>Grupos arquivados</b><span>${archivedRows.length}</span></summary>${cards(archivedRows)}</details>`:''}`
  }
  function studyFilesHtml(d){
    const me=userProfile();
    return `<section class="card circle-files-card"><div class="card-head"><div><h3>Materiais compartilhados</h3><small>Compartilhe links de PDFs, Drive, OneDrive, vídeos, artigos e outros materiais — sem precisar de armazenamento pago.</small></div>${d.archived?'':`<button class="primary-btn" data-study-link-add="${d.id}">＋ Compartilhar link</button>`}</div><div class="circle-file-list">${d.files?.length?d.files.map(f=>`<article class="circle-file-row"><div class="circle-file-icon">↗</div><div class="row-main"><b>${esc(f.name||'Material')}</b><small>${esc(f.uploaderName||'Membro')}${f.note?` · ${esc(f.note)}`:''}</small></div><button class="secondary-btn compact" data-circle-link-open="${esc(f.url||'')}" type="button">Abrir</button>${!d.archived&&(f.uploaderId===me.uid||d.ownerId===me.uid)?`<button class="icon-btn danger-soft" title="Remover" data-circle-file-delete="${f.id}" data-circle-id="${d.id}">×</button>`:''}</article>`).join(''):'<div class="empty">Nenhum material compartilhado ainda.</div>'}</div></section>`
  }
  function renderStudyCircleDetail(d){
    const ranking=studyRanking(d),active=activeMembers(d),me=userProfile(),local=activeStudyLocal(),mine=local?.circleId===d.id,panel=state.ui.studyCirclePanel||'room';
    const studyAction=d.archived?'':(mine?'<button class="danger-btn compact" id="stopCircleStudy">Finalizar sessão</button>':'<button class="primary-btn" data-circle-study-start="'+d.id+'">Estudar junto</button>');
    const room=`<section class="grid grid-3">${metric('Membros',d.members.length,'grupo privado')}${metric('Estudando agora',active.length,'sessões ativas')}${metric('Tempo 7 dias',Math.round(ranking.reduce((a,x)=>a+x.minutes,0)/60)+'h','total do grupo')}</section><section class="section grid grid-2 circle-main-grid"><article class="card"><div class="card-head"><div><h3>Sala de estudo</h3><small>${d.archived?'Grupo arquivado · histórico disponível para consulta.':'Veja quem está estudando e entre em uma sessão.'}</small></div>${studyAction}</div>${mine?`<div class="circle-active-session"><span class="live-dot"></span><div><b>${esc(local.subject||'Sessão de estudo')}</b><small>iniciada ${new Date(local.startedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</small></div></div>`:''}<div class="circle-member-list">${d.members.map(m=>{const on=active.some(a=>a.userId===m.userId);return `<div class="circle-member"><div class="circle-avatar">${memberAvatar(m)}</div><div><b>${esc(m.name||'Usuário')}${m.userId===me.uid?' · você':''}</b><small>${on?`🟢 ${esc(m.activeStudy.subject||'Estudando agora')}`:'offline'}</small></div></div>`}).join('')}</div></article><article class="card"><div class="card-head"><div><h3>Ranking saudável · 7 dias</h3><small>score limita excesso de horas e valoriza sessões consistentes</small></div></div><div class="circle-ranking">${ranking.map((r,i)=>`<div class="rank-row"><strong>${i+1}</strong><div class="circle-avatar small">${memberAvatar(r)}</div><div class="row-main"><b>${esc(r.name)}</b><small>${Math.floor(r.minutes/60)}h ${r.minutes%60}m · ${r.sessions} sessões</small></div><span class="pill accent">${r.score} pts</span></div>`).join('')}</div></article></section><section class="section card"><div class="card-head"><div><h3>Desafios</h3><small>metas coletivas para incentivar, não punir</small></div>${d.archived?'':`<button class="text-btn" data-circle-challenge="${d.id}" data-circle-type="study">＋ desafio</button>`}</div>${d.challenges.length?d.challenges.slice().sort((a,b)=>Number(b.clientTime||0)-Number(a.clientTime||0)).map(c=>circleChallengeCard(c,d,'study')).join(''):'<div class="empty">Nenhum desafio criado ainda.</div>'}</section>`;
    return `<div class="circle-detail"><div class="circle-detail-head"><button class="text-btn" data-circle-back="study">← Meus grupos</button><div class="circle-title-row"><div><span class="eyebrow">Study Circle${d.archived?' · arquivado':''}</span><h3>${esc(d.name)}</h3><p>${esc(d.description||'Estudo em grupo com foco, revisão e constância.')}</p></div><div class="circle-code"><small>${d.archived?'Convite pausado':'Código'}</small><button ${d.archived?'disabled':''} data-copy-circle-code="${esc(d.inviteCode||'')}">${d.archived?'Arquivado':esc(d.inviteCode||'—')}</button></div></div>${d.archived?'<div class="auth-note">Este grupo está arquivado. O histórico continua disponível, mas novas mensagens, sessões, desafios e materiais ficam pausados até o criador reativar.</div>':''}<div class="circle-inner-tabs"><button class="tab ${panel==='room'?'active':''}" data-circle-panel="room">Visão do grupo</button><button class="tab ${panel==='files'?'active':''}" data-circle-panel="files">Materiais <span>${d.files?.length||0}</span></button><button class="tab ${panel==='chat'?'active':''}" data-circle-panel="chat">Chat</button></div></div>${panel==='files'?studyFilesHtml(d):panel==='chat'?circleChatHtml(d,'study'):room}<div class="circle-footer-actions"><span class="muted">${d.ownerId===me.uid?'Você criou este grupo.':'Você participa deste grupo.'}</span><button class="secondary-btn compact" data-circle-settings="${d.id}">Configurações do grupo</button></div></div>`
  }
  function circleChatHtml(d,type='study'){
    const files=new Map((d.files||[]).map(f=>[f.id,f]));
    return `<article class="card circle-chat"><div class="card-head"><div><h3>Conversa do grupo</h3><small>${d.archived?'Modo leitura enquanto o grupo estiver arquivado.':'Converse e compartilhe materiais úteis.'}</small></div>${d.archived?'':`<button class="secondary-btn compact" data-study-link-add="${d.id}">🔗 Link</button>`}</div><div class="circle-chat-list">${d.posts.length?d.posts.slice(0,30).map(p=>{const f=(p.kind==='link'||p.kind==='file')?files.get(p.fileId):null;return `<div class="circle-message"><div class="circle-avatar small">${memberAvatar({name:p.authorName,photoURL:p.photoURL})}</div><div class="circle-message-body"><b>${esc(p.authorName||'Usuário')}</b>${f?`<button class="chat-file" data-circle-link-open="${esc(f.url||'')}" type="button"><span>↗</span><div><strong>${esc(f.name||'Material')}</strong><small>abrir material compartilhado</small></div></button>`:`<p>${esc(p.text||'')}</p>`}</div></div>`}).join(''):'<div class="empty">Ainda não há mensagens.</div>'}</div>${d.archived?'<div class="empty">Grupo arquivado · conversa em modo leitura.</div>':`<form class="circle-message-form" data-circle-message-form="${d.id}"><input class="input" name="message" maxlength="600" placeholder="Escreva uma mensagem para o grupo…"><button class="primary-btn">Enviar</button></form>`}</article>`
  }
  function circleShell(type){
    type='study';syncCircleAccount();
    if(!communityReady())return `<section class="card community-locked"><span class="community-icon">◫</span><h3>Study Circles</h3><p>Para grupos compartilhados, entre com Google ou e-mail verificado. Os grupos usam o Firestore e só os membros autorizados conseguem ler o conteúdo.</p><button class="primary-btn" data-route="settings">Ver conta e nuvem</button></section>`;
    const selected=state.ui.studyCircleId,details=selected?circleCache.details.get(selected):null,rows=circleCache.study;
    if(selected&&!details){queueCircleLoad('study',selected,true);return `<div class="card circle-loading"><div class="loader-dot"></div><b>Carregando grupo…</b></div>`}
    if(selected&&details)return renderStudyCircleDetail(details);
    if(!rows){queueCircleListLoad('study');return `<div class="card circle-loading"><div class="loader-dot"></div><b>Carregando seus grupos…</b></div>`}
    return renderCircleList('study',rows)
  }
  function renderStudyCircles(){return circleShell('study')}
  async function queueCircleListLoad(type){if(circleCache.loading.has('ui:'+type))return;circleCache.loading.add('ui:'+type);try{await loadMyCircles(type,true)}catch(e){circleErr(e)}finally{circleCache.loading.delete('ui:'+type);if(!document.body.classList.contains('auth-locked'))render()}}
  async function queueCircleLoad(type,id,force=false){
    if(circleCache.loading.has('ui:'+id))return;
    circleCache.loading.add('ui:'+id);
    try{
      const details=await loadCircleDetails(id,force);
      if(!details){
        if(state.ui.studyCircleId===id)state.ui.studyCircleId='';
        save();
        return;
      }
      attachCircleRealtime(type,id);
    }catch(e){
      // A seleção de Circle é estado local de interface. Ao trocar de conta,
      // nunca devemos manter aberto um grupo que pertence à sessão anterior.
      if(state.ui.studyCircleId===id)state.ui.studyCircleId='';
      circleCache.details.delete(id);
      save();
      circleErr(e,'Não foi possível abrir este grupo. Voltamos para sua lista de grupos.');
    }finally{
      circleCache.loading.delete('ui:'+id);
      if(!document.body.classList.contains('auth-locked'))render();
    }
  }
  async function refreshVisibleCircle(id){if(state.ui.studyCircleId!==id)return;await loadCircleDetails(id,true);render()}
  function attachCircleRealtime(type,id){
    stopCircleListeners();if(!communityReady()||!id)return;const root=circleRoot(id);const refresh=()=>{clearTimeout(window.__circleRealtimeTimer);window.__circleRealtimeTimer=setTimeout(async()=>{try{await loadCircleDetails(id,true);const still=state.ui.studyCircleId===id;if(still&&!document.body.classList.contains('auth-locked'))render()}catch(e){}},350)};
    ['members','sessions','posts','challenges','files'].forEach(c=>{try{circleUnsubs.push(root.collection(c).onSnapshot(refresh,()=>{}))}catch(e){}})
  }

  // ---------- UI PATCHES ----------
  const baseAcademicOverview=academicOverview;
  // A visão geral fica limpa: Revisões e Grupos de estudo já possuem abas próprias.
  academicOverview=function(){return baseAcademicOverview()};
  const baseAcademicTab=academicTab;
  academicTab=function(tab){if(tab==='groups')return renderStudyCircles();return baseAcademicTab(tab)};
  const baseRenderAcademics=renderAcademics;
  renderAcademics=function(){return baseRenderAcademics()};
  const baseOverview=renderOverview;
  renderOverview=function(){const due=dueMemorySummaries();const active=activeStudyLocal();return baseOverview()+`<section class="section grid grid-2 today-smart-layer"><article class="card"><div class="card-head"><div><span class="eyebrow">Memória</span><h3>${due.length?`${due.length} revisão${due.length===1?'':'ões'} para hoje`:'Revisões em dia'}</h3><small>o AUVRYN agenda o próximo contato conforme sua lembrança</small></div><button class="text-btn" data-open-memory>Revisar →</button></div>${due.length?`<div class="list">${due.slice(0,3).map(s=>`<div class="row"><div class="row-main"><b>${esc(s.title)}</b><small>${esc(s.discipline||'')} · ${s.nextReview<today()?'atrasada':'hoje'}</small></div><span class="pill accent">${s.reviewInterval||1}d</span></div>`).join('')}</div>`:'<div class="empty success-empty">✓ Nada vencido hoje.</div>'}</article><article class="card"><div class="card-head"><div><span class="eyebrow">Conexão</span><h3>${active?'Sessão compartilhada em andamento':'Study Circles'}</h3><small>${active?esc(active.subject||'Estudo'):'estude junto sem expor seus dados privados'}</small></div></div>${active?`<div class="circle-active-session"><span class="live-dot"></span><div><b>${esc(active.subject||'Sessão de estudo')}</b><small>seu tempo também entra nos Insights</small></div><button class="danger-btn compact" id="stopCircleStudy">Finalizar</button></div>`:`<button class="secondary-btn" data-open-study-circles>Abrir meus grupos →</button>`}</article></section>`};

  // Make projects/tasks a little more realistic without adding navigation.
  try{const tf=schemas.task.fields.find(x=>x[0]==='status');if(tf)tf[3]=['Pendente','Em andamento','Aguardando','Bloqueada','Algum dia','Concluída'];const pf=schemas.project.fields.find(x=>x[0]==='status');if(pf)pf[3]=['Ideias','Planejando','Em andamento','Aguardando','Em pausa','Concluído']}catch(e){}

  const baseInsights=renderInsights;
  renderInsights=function(){
    const postponed=state.tasks.filter(x=>Number(x.postponedCount||0)>0).sort((a,b)=>Number(b.postponedCount||0)-Number(a.postponedCount||0)).slice(0,6);
    return baseInsights()+`<section class="section card"><div class="card-head"><div><h3>Padrões de adiamento</h3><small>tarefas que voltam várias vezes podem estar grandes, vagas ou sem prioridade real</small></div><span class="pill ${postponed.length?'amber':'green'}">${postponed.length?postponed.length+' recorrentes':'em dia'}</span></div>${postponed.length?`<div class="list">${postponed.map(x=>`<div class="row"><div class="row-main"><b>${esc(x.title)}</b><small>${esc(x.area)} · atualmente em ${fmtDate(x.date,{day:'2-digit',month:'short'})}</small></div><span class="pill amber">adiada ${Number(x.postponedCount||0)}x</span></div>`).join('')}</div><div class="insight-callout" style="margin-top:14px"><b>Não é só disciplina.</b><p>Se algo é adiado repetidamente, o AUVRYN sugere quebrar a tarefa, renegociar o prazo ou decidir que ela não é prioridade agora.</p></div>`:'<div class="empty success-empty">✓ Nenhuma tarefa está acumulando adiamentos frequentes.</div>'}</section>`;
  };

  // ---------- DIALOGS ----------
  function injectCircleDialogs(){if($('#circleCreateDialog'))return;document.body.insertAdjacentHTML('beforeend',`
  <dialog id="circleCreateDialog" class="dialog editor-dialog"><form id="circleCreateForm"><div class="dialog-head"><div><span class="eyebrow">Circles</span><h2>Criar grupo</h2></div><button class="icon-btn" type="button" data-circle-close>×</button></div><div class="dialog-body"><input type="hidden" name="type"><div class="field"><label>Nome do grupo</label><input class="input" name="name" maxlength="80" required placeholder="Ex.: Cardio sem sofrimento"></div><div class="field"><label>Descrição</label><textarea class="textarea" name="description" maxlength="280" placeholder="Qual é o objetivo deste grupo?"></textarea></div><div class="auth-note">O grupo é privado. Somente pessoas com o código de convite e uma conta AUVRYN verificada conseguem entrar.</div></div><div class="dialog-actions"><span class="spacer"></span><button class="secondary-btn" type="button" data-circle-close>Cancelar</button><button class="primary-btn" type="submit">Criar grupo</button></div></form></dialog>
  <dialog id="circleJoinDialog" class="dialog confirm-dialog"><form id="circleJoinForm"><div class="dialog-head"><div><span class="eyebrow">Convite</span><h2>Entrar em um Circle</h2></div><button class="icon-btn" type="button" data-circle-close>×</button></div><div class="dialog-body"><div class="field"><label>Código do grupo</label><input class="input circle-code-input" name="code" maxlength="10" required placeholder="Ex.: A7K9Q2Z" autocomplete="off"></div></div><div class="dialog-actions"><span class="spacer"></span><button class="secondary-btn" type="button" data-circle-close>Cancelar</button><button class="primary-btn" type="submit">Entrar</button></div></form></dialog>
  <dialog id="circleStudyDialog" class="dialog confirm-dialog"><form id="circleStudyForm"><div class="dialog-head"><div><span class="eyebrow">Sessão compartilhada</span><h2>O que você vai estudar?</h2></div><button class="icon-btn" type="button" data-circle-close>×</button></div><div class="dialog-body"><input type="hidden" name="circleId"><div class="field"><label>Disciplina / tema</label><input class="input" name="subject" maxlength="80" required placeholder="Ex.: Arritmias — Cardiologia"></div><p class="muted">Os amigos verão apenas o tema e que você está estudando. Suas notas, PDFs e tarefas continuam privados.</p></div><div class="dialog-actions"><span class="spacer"></span><button class="secondary-btn" type="button" data-circle-close>Cancelar</button><button class="primary-btn" type="submit">Iniciar sessão</button></div></form></dialog>
  <dialog id="studyLinkDialog" class="dialog editor-dialog"><form id="studyLinkForm"><div class="dialog-head"><div><span class="eyebrow">Material do grupo</span><h2>Compartilhar link</h2></div><button class="icon-btn" type="button" data-circle-close>×</button></div><div class="dialog-body"><input type="hidden" name="circleId"><div class="field"><label>Nome do material</label><input class="input" name="name" maxlength="80" required placeholder="Ex.: PDF — Arritmias"></div><div class="field"><label>Link</label><input class="input" name="url" type="url" required placeholder="https://drive.google.com/..."></div><div class="field"><label>Observação <span class="muted">opcional</span></label><textarea class="textarea" name="note" maxlength="280" placeholder="Ex.: páginas 12–28"></textarea></div><div class="auth-note">Você pode usar Google Drive, OneDrive, Dropbox, YouTube, artigos ou qualquer link HTTPS. O AUVRYN não hospeda o arquivo, então não exige plano pago.</div></div><div class="dialog-actions"><span class="spacer"></span><button class="secondary-btn" type="button" data-circle-close>Cancelar</button><button class="primary-btn" type="submit">Compartilhar</button></div></form></dialog>
  <dialog id="circleChallengeDialog" class="dialog editor-dialog"><form id="circleChallengeForm"><div class="dialog-head"><div><span class="eyebrow">Desafio</span><h2>Criar desafio</h2></div><button class="icon-btn" type="button" data-circle-close>×</button></div><div class="dialog-body"><input type="hidden" name="circleId"><input type="hidden" name="type" value="study"><div class="field"><label>Nome</label><input class="input" name="title" maxlength="80" required placeholder="Ex.: Semana da constância"></div><div class="field-row"><div class="field"><label>Meta coletiva (minutos)</label><input class="input" name="target" type="number" min="1" required value="300"></div><div class="field"><label>Até</label><input class="input" name="endDate" type="date" required></div></div></div><div class="dialog-actions"><span class="spacer"></span><button class="secondary-btn" type="button" data-circle-close>Cancelar</button><button class="primary-btn" type="submit">Criar desafio</button></div></form></dialog>
  <dialog id="circleSettingsDialog" class="dialog editor-dialog"><form id="circleSettingsForm"><div class="dialog-head"><div><span class="eyebrow">Study Circle</span><h2>Configurações do grupo</h2></div><button class="icon-btn" type="button" data-circle-close>×</button></div><div class="dialog-body"><input type="hidden" name="circleId"><div id="circleOwnerSettings"><div class="field"><label>Nome</label><input class="input" name="name" maxlength="80"></div><div class="field"><label>Descrição</label><textarea class="textarea" name="description" maxlength="280"></textarea></div><button class="secondary-btn" type="submit">Salvar nome e descrição</button><div class="separator"></div><div class="setting-row"><div><b id="circleArchiveTitle">Arquivar grupo</b><small id="circleArchiveHelp">Tira o grupo da lista principal sem apagar o histórico.</small></div><button class="secondary-btn" type="button" id="circleArchiveBtn">Arquivar</button></div><div class="setting-row danger-zone"><div><b>Excluir permanentemente</b><small>Apaga chat, sessões, desafios e materiais para todos. Não pode ser desfeito.</small></div><button class="danger-btn" type="button" id="circleDeleteBtn">Excluir grupo</button></div></div><div id="circleMemberSettings" hidden><div class="auth-note">Você pode sair deste grupo quando quiser. O grupo continuará existindo para os demais membros.</div><button class="danger-btn" type="button" id="circleLeaveBtn">Sair do grupo</button></div></div><div class="dialog-actions"><span class="spacer"></span><button class="secondary-btn" type="button" data-circle-close>Fechar</button></div></form></dialog>`);
    $$('[data-circle-close]').forEach(b=>b.onclick=closeCircleDialogs);
    $('#circleCreateForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.currentTarget);createCircle(fd.get('type'),fd.get('name'),fd.get('description'))};
    $('#circleJoinForm').onsubmit=e=>{e.preventDefault();joinCircle(new FormData(e.currentTarget).get('code'))};
    $('#circleStudyForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.currentTarget);startStudyCircleSession(fd.get('circleId'),fd.get('subject'))};
    $('#studyLinkForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.currentTarget);addStudyCircleLink(fd.get('circleId'),fd.get('name'),fd.get('url'),fd.get('note'))};
    $('#circleChallengeForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.currentTarget);addCircleChallenge(fd.get('circleId'),'study',fd.get('title'),fd.get('target'),fd.get('endDate'))};
    $('#circleSettingsForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.currentTarget);updateCircleSettings(fd.get('circleId'),fd.get('name'),fd.get('description'))};
  }
  function closeCircleDialogs(){$$('#circleCreateDialog,#circleJoinDialog,#circleStudyDialog,#studyLinkDialog,#circleChallengeDialog,#circleSettingsDialog').forEach(d=>{try{if(d.open)d.close()}catch(e){}})}
  function openCreateCircle(type){if(!communityReady())return toast('Entre com uma conta verificada primeiro.');type='study';const d=$('#circleCreateDialog');d.querySelector('[name=type]').value='study';d.querySelector('h2').textContent='Criar Study Circle';d.showModal();setTimeout(()=>d.querySelector('[name=name]').focus(),50)}
  function openJoinCircle(type){if(!communityReady())return toast('Entre com uma conta verificada primeiro.');const d=$('#circleJoinDialog');d.dataset.type='study';d.showModal();setTimeout(()=>d.querySelector('[name=code]').focus(),50)}
  function openStudySession(circleId){const d=$('#circleStudyDialog');d.querySelector('[name=circleId]').value=circleId;d.showModal();setTimeout(()=>d.querySelector('[name=subject]').focus(),50)}
  function openStudyLink(circleId){const d=$('#studyLinkDialog');d.querySelector('form').reset();d.querySelector('[name=circleId]').value=circleId;d.showModal();setTimeout(()=>d.querySelector('[name=name]').focus(),50)}
  function openChallenge(circleId,type){
    const d=$('#circleChallengeDialog');
    d.querySelector('form').reset();
    d.querySelector('[name=circleId]').value=circleId;
    d.querySelector('[name=type]').value='study';
    d.querySelector('[name=target]').value=300;
    d.querySelector('[name=endDate]').value=addDays(today(),7);
    d.showModal();
    setTimeout(()=>d.querySelector('[name=title]').focus(),40);
  }
  async function openCircleSettings(circleId){
    const d=await loadCircleDetails(circleId,true);if(!d)return toast('Não foi possível abrir as configurações deste grupo.');
    const me=userProfile(),dlg=$('#circleSettingsDialog'),owner=d.ownerId===me.uid;dlg.querySelector('[name=circleId]').value=circleId;
    $('#circleOwnerSettings').hidden=!owner;$('#circleMemberSettings').hidden=owner;
    if(owner){
      dlg.querySelector('[name=name]').value=d.name||'';dlg.querySelector('[name=description]').value=d.description||'';
      $('#circleArchiveTitle').textContent=d.archived?'Reativar grupo':'Arquivar grupo';
      $('#circleArchiveHelp').textContent=d.archived?'O grupo volta para a lista principal e aceita novas atividades.':'Tira o grupo da lista principal sem apagar o histórico.';
      $('#circleArchiveBtn').textContent=d.archived?'Reativar':'Arquivar';
      $('#circleArchiveBtn').onclick=()=>setCircleArchived(circleId,!d.archived);
      $('#circleDeleteBtn').onclick=()=>deleteCirclePermanently(circleId);
    }else{$('#circleLeaveBtn').onclick=()=>leaveCircle('study',circleId)}
    dlg.showModal();
  }

  // ---------- AUVRYN ASSISTANT ----------
  const ASSISTANT_TYPES={task:'Tarefa',event:'Evento',exam:'Avaliação',assignment:'Trabalho',project:'Projeto',habit:'Hábito',summary:'Resumo',library:'Biblioteca',purchase:'Compra',trip:'Viagem',goal:'Objetivo',journal:'Diário',health:'Saúde',workout:'Treino'};
  let assistantPlan=[];
  function naturalDate(text){
    const low=String(text||'').toLowerCase(),now=new Date(today()+'T12:00:00');
    if(/depois de amanh[ãa]/.test(low))return addDays(today(),2);if(/amanh[ãa]/.test(low))return addDays(today(),1);if(/\bhoje\b/.test(low))return today();
    const dm=low.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);if(dm){let y=dm[3]?Number(dm[3].length===2?'20'+dm[3]:dm[3]):now.getFullYear();let out=`${y}-${String(dm[2]).padStart(2,'0')}-${String(dm[1]).padStart(2,'0')}`;if(!dm[3]&&out<today())out=`${y+1}-${String(dm[2]).padStart(2,'0')}-${String(dm[1]).padStart(2,'0')}`;return out}
    const md=low.match(/\bdia\s+(\d{1,2})(?:\s+de\s+(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro))?/);if(md){const months={janeiro:1,fevereiro:2,'março':3,marco:3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12};let m=md[2]?months[md[2].normalize('NFD').replace(/[\u0300-\u036f]/g,'')]:now.getMonth()+1,y=now.getFullYear();let out=`${y}-${String(m).padStart(2,'0')}-${String(md[1]).padStart(2,'0')}`;if(out<today())out=`${y+1}-${String(m).padStart(2,'0')}-${String(md[1]).padStart(2,'0')}`;return out}
    const days={domingo:0,segunda:1,'segunda-feira':1,terça:2,terca:2,'terça-feira':2,'terca-feira':2,quarta:3,'quarta-feira':3,quinta:4,'quinta-feira':4,sexta:5,'sexta-feira':5,sábado:6,sabado:6};
    for(const [name,target] of Object.entries(days)){if(new RegExp(`\\b${name}\\b`).test(low)){let delta=(target-now.getDay()+7)%7;if(delta===0)delta=7;return addDays(today(),delta)}}return today();
  }
  function naturalTime(text){const low=String(text||'').toLowerCase(),m=low.match(/\b([01]?\d|2[0-3])(?::|h)([0-5]\d)?\b/)||low.match(/\b(?:às|as)\s+([01]?\d|2[0-3])(?:[:h]([0-5]\d))?\b/);return m?`${String(m[1]).padStart(2,'0')}:${String(m[2]||'00').padStart(2,'0')}`:''}
  function cleanAssistantTitle(raw,type='task'){
    let s=String(raw||'').trim();
    s=s.replace(/^(todo dia|todos os dias|diariamente)\s+(eu\s+)?(quero|preciso|vou)?\s*/i,'');
    s=s.replace(/^(eu\s+)?(preciso|tenho que|tenho de|quero|gostaria de|me lembre de|anote|adicione|adicionar|coloque|crie|criar|marque)\s+/i,'');
    s=s.replace(/(?:^|\s)(hoje|amanh[ãa]|depois de amanh[ãa])(?=\s|$)/ig,' ').replace(/(?:^|\s)(segunda(?:-feira)?|terça(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sábado|sabado|domingo)(?=\s|$)/ig,' ').replace(/\b(?:dia\s+)?\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/g,'').replace(/\bdia\s+\d{1,2}(?:\s+de\s+\w+)?/ig,'').replace(/(?:às|as)\s+\d{1,2}(?:(?::|h)\d{0,2})?/ig,'').replace(/\b\d{1,2}(?:h|:)\d{0,2}\b/g,'');
    if(type==='project')s=s.replace(/^projeto\s+/i,'').replace(/\s+(?:para|at[eé])\s*$/i,'');
    if(type==='exam'){s=s.replace(/^(?:tenho\s+)?(?:uma\s+)?(?:prova|avalia[cç][ãa]o|teste)\s*(?:de|da|do)?\s*/i,'');if(s)s=`Prova de ${s}`}
    if(type==='assignment')s=s.replace(/^(?:entregar|fazer|preparar)?\s*(?:um\s+|o\s+)?(?:trabalho|entrega|semin[aá]rio)\s*(?:de|da|do)?\s*/i,'');
    if(type==='library')s=s.replace(/\s+(?:na|à|a)\s+(?:minha\s+)?(?:lista\s+de\s+)?(?:livros?|filmes?|s[eé]ries?|podcasts?|jogos?|m[uú]sicas?|[aá]lbuns?)(?:\s+da\s+biblioteca)?\s*$/i,'').replace(/\s+(?:na|à|a)\s+(?:minha\s+)?biblioteca\s*$/i,'');
    s=s.replace(/\s{2,}/g,' ').replace(/^[,.;:\-\s]+|[,.;:\-\s]+$/g,'').trim();
    return s||String(raw||'').trim();
  }
  function localAssistantOne(raw){
    const low=raw.toLowerCase(),date=naturalDate(raw),time=naturalTime(raw);let type='task',area='Pessoal';
    if(/\b(prova|avalia[cç][ãa]o|teste)\b/.test(low))type='exam';else if(/\b(trabalho|entrega|semin[aá]rio)\b/.test(low))type='assignment';else if(/\b(consulta|reuni[ãa]o|compromisso|aula|evento)\b/.test(low))type='event';else if(/\b(projeto|planejar)\b/.test(low))type='project';else if(/\b(h[aá]bito|todo dia|todos os dias|diariamente)\b/.test(low))type='habit';else if(/\b(resumo|anota[cç][ãa]o de estudo)\b/.test(low))type='summary';else if(/\b(livros?|filmes?|s[eé]ries?|podcasts?|jogos?|[aá]lbuns?|m[uú]sicas?)\b/.test(low)&&/\b(adicionar|adicione|colocar|coloque|biblioteca|lista)\b/.test(low))type='library';else if(/\b(comprar|compra)\b/.test(low))type='purchase';else if(/\b(viagem|viajar)\b/.test(low))type='trip';else if(/\b(meta|objetivo)\b/.test(low))type='goal';else if(/\b(di[aá]rio|registre meu dia|anote no di[aá]rio)\b/.test(low))type='journal';else if(/\b(consulta|exame|vacina|medicamento)\b/.test(low))type='health';else if(/\b(ficha de treino|treino de|treino a|treino b)\b/.test(low))type='workout';
    if(/faculdade|estud|prova|trabalho|disciplina|resumo|aula/.test(low))area='Faculdade';else if(/sa[uú]de|treino|academia|corrida|consulta|exame/.test(low))area='Saúde';else if(/casa|limpar|mercado|organizar a casa/.test(low))area='Casa';else if(/vida|pessoal/.test(low))area='Vida';
    let libraryType='book';if(/filme/.test(low))libraryType='movie';else if(/s[eé]rie/.test(low))libraryType='series';else if(/podcast/.test(low))libraryType='podcast';else if(/jogo/.test(low))libraryType='game';else if(/[aá]lbum|m[uú]sica/.test(low))libraryType='music';
    const duration=Number((low.match(/\b(\d{1,3})\s*(?:min|minutos)\b/)||[])[1]||20),frequency=/todo dia|todos os dias|diariamente/.test(low)?7:5;
    return {type,title:cleanAssistantTitle(raw,type),date,time,area,duration,libraryType,frequency,raw};
  }
  function localAssistant(text){const parts=String(text||'').split(/\n+|;(?=\s*[A-Za-zÀ-ÿ])/).map(x=>x.trim()).filter(Boolean).slice(0,6);return {reply:'Entendi. Organizei o pedido e vou mostrar onde cada item será salvo antes de confirmar.',actions:parts.map(localAssistantOne),source:'local'}}
  function normalizeAssistantAction(a){
    const allowed=Object.keys(ASSISTANT_TYPES);let type=allowed.includes(a?.type)?a.type:'task';let date=/^\d{4}-\d{2}-\d{2}$/.test(a?.date||'')?a.date:(a?.date?naturalDate(a.date):today());let time=/^\d{2}:\d{2}$/.test(a?.time||'')?a.time:'';
    return {type,title:String(a?.title||a?.raw||'Nova entrada').trim().slice(0,160),date,time,endTime:String(a?.endTime||''),area:String(a?.area||'Pessoal').slice(0,30),duration:clamp(Number(a?.duration)||20,1,600),discipline:String(a?.discipline||''),period:String(a?.period||''),notes:String(a?.notes||''),frequency:clamp(Number(a?.frequency)||5,1,7),libraryType:String(a?.libraryType||'book'),creator:String(a?.creator||''),status:String(a?.status||''),due:String(a?.due||a?.date||date),content:String(a?.content||'')};
  }
  function assistantActionMeta(a){const pieces=[ASSISTANT_TYPES[a.type]||'Entrada'];if(['task','event','exam','assignment','journal','health'].includes(a.type))pieces.push(fmtDate(a.date,{day:'2-digit',month:'short'}));if(a.time)pieces.push(a.time);if(a.area)pieces.push(a.area);return pieces.filter(Boolean).join(' · ')}
  function assistantPreview(plan,reply='',source='local'){
    const box=$('#assistantPreview');if(!box)return;assistantPlan=(plan||[]).map(normalizeAssistantAction);const mode=source==='ai'?'<span class="pill accent">IA online</span>':'<span class="pill">organizador local</span>';
    box.innerHTML=`<div class="assistant-answer"><div>${mode}<b>${esc(reply||'Veja como o AUVRYN entendeu:')}</b></div><small>Nada foi salvo ainda. Confira e confirme.</small></div>${assistantPlan.map((a,i)=>`<article class="assistant-action"><span class="assistant-action-index">${i+1}</span><div><b>${esc(a.title)}</b><small>${esc(assistantActionMeta(a))}</small></div></article>`).join('')}<div class="assistant-confirm-row"><button class="secondary-btn" type="button" id="assistantRewrite">Corrigir frase</button><button class="primary-btn" type="button" id="assistantConfirm" ${assistantPlan.length?'':'disabled'}>Confirmar e adicionar</button></div>`;
    $('#assistantRewrite').onclick=()=>$('#assistantText')?.focus();$('#assistantConfirm').onclick=commitAssistantPlan;
  }
  async function analyzeAssistantText(text){
    const local=localAssistant(text);assistantPreview(local.actions,'Interpretando…','local');const btn=$('#assistantAnalyze');if(btn){btn.disabled=true;btn.textContent='Pensando…'}
    try{if(typeof window.AUVRYN_AI_INTERPRET==='function'){const context={today:today(),course:state.settings.course||'',currentPeriod:state.ui.academicPeriod||'',projects:state.projects.map(p=>p.title).slice(0,30)};const ai=await window.AUVRYN_AI_INTERPRET(text,context);if(ai?.actions?.length)assistantPreview(ai.actions,ai.reply||'Organizei seu pedido.', 'ai');else assistantPreview(local.actions,local.reply,'local')}else assistantPreview(local.actions,local.reply,'local')}
    catch(e){console.warn('AUVRYN Assistant AI:',e);assistantPreview(local.actions,'A IA online não respondeu agora, então usei o organizador local para não interromper você.','local')}
    finally{if(btn){btn.disabled=false;btn.textContent='Interpretar'}}
  }
  function commitAssistantAction(a){
    const id=uid();switch(a.type){
      case 'event':{const start=a.time||'09:00',h=Math.min(23,Number(start.slice(0,2))+1),end=a.endTime||`${String(h).padStart(2,'0')}:${start.slice(3)}`;state.events.push({...defaultFor('event'),id,title:a.title,date:a.date,start,end,category:a.area||'Pessoal',notes:a.notes});break}
      case 'exam':state.exams.push({...defaultFor('exam'),id,title:a.title,date:a.date,time:a.time,discipline:a.discipline,period:a.period,notes:a.notes});break;
      case 'assignment':state.assignments.push({...defaultFor('assignment'),id,title:a.title,date:a.date,time:a.time,discipline:a.discipline,period:a.period,notes:a.notes});break;
      case 'project':state.projects.push({...defaultFor('project'),id,title:a.title,area:a.area||'Pessoal',due:a.due||a.date,notes:a.notes});break;
      case 'habit':state.habits.push({...defaultFor('habit'),id,title:a.title,category:a.area==='Faculdade'?'Estudo':a.area==='Saúde'?'Saúde':'Bem-estar',frequency:a.frequency,logs:{}});break;
      case 'summary':state.summaries.push({...defaultFor('summary'),id,title:a.title,period:a.period||state.ui.academicPeriod||'1º',discipline:a.discipline,content:a.content||a.notes,updated:today(),lastReview:today()});break;
      case 'library':state.library.push({...defaultFor('library'),id,type:['book','movie','series','podcast','game','music','place','experience'].includes(a.libraryType)?a.libraryType:'book',title:a.title,creator:a.creator,status:a.status||'Quero'});break;
      case 'purchase':state.purchases.push({...defaultFor('purchase'),id,title:a.title,target:a.date,notes:a.notes});break;
      case 'trip':state.trips.push({...defaultFor('trip'),id,title:a.title,start:a.date,end:addDays(a.date,7),notes:a.notes});break;
      case 'goal':state.goals.push({...defaultFor('goal'),id,title:a.title,area:a.area||'Pessoal',due:a.due||a.date,notes:a.notes});break;
      case 'journal':state.journal.push({...defaultFor('journal'),id,date:a.date,title:a.title,content:a.content||a.notes});break;
      case 'health':state.health.push({...defaultFor('health'),id,title:a.title,date:a.date,notes:a.notes});break;
      case 'workout':state.workouts.push({...defaultFor('workout'),id,title:a.title,notes:a.notes});break;
      default:state.tasks.push({...defaultFor('task'),id,title:a.title,date:a.date,time:a.time,duration:a.duration,area:a.area||'Pessoal',notes:a.notes});
    }
  }
  function commitAssistantPlan(){if(!assistantPlan.length)return toast('Nada para adicionar.');assistantPlan.forEach(commitAssistantAction);save();const d=$('#assistantDialog');if(d?.open)d.close();const n=assistantPlan.length;assistantPlan=[];render();toast(`${n} item${n===1?'':'s'} adicionado${n===1?'':'s'} pelo AUVRYN Assistant`)}
  function injectAssistantDialog(){if($('#assistantDialog'))return;document.body.insertAdjacentHTML('beforeend',`
    <dialog id="assistantDialog" class="dialog editor-dialog assistant-dialog"><div class="dialog-head"><div><span class="eyebrow">AUVRYN Assistant</span><h2>Fale. Eu organizo.</h2></div><button class="icon-btn" type="button" id="assistantClose">×</button></div><div class="dialog-body"><div class="assistant-intro"><b>Você não precisa escolher a aba antes.</b><p>Escreva como falaria normalmente. O AUVRYN identifica o tipo, a data e o lugar certo, mostra uma prévia e só salva depois da sua confirmação.</p><div class="assistant-examples"><button type="button" data-assistant-example="Tenho prova de Cardiologia dia 20 às 14h">“Tenho prova de Cardio dia 20 às 14h”</button><button type="button" data-assistant-example="Todo dia quero beber 2 litros de água">“Todo dia quero beber 2 L de água”</button><button type="button" data-assistant-example="Crie projeto TCC para 30/11">“Crie projeto TCC para 30/11”</button><button type="button" data-assistant-example="Adicione Duna na minha lista de livros">“Adicione Duna na Biblioteca”</button></div></div><div class="field"><label>O que você precisa organizar?</label><textarea class="textarea assistant-text" id="assistantText" placeholder="Ex.: preciso entregar o trabalho de Bioética sexta e estudar 40 minutos amanhã às 18h"></textarea></div><button class="primary-btn assistant-analyze" type="button" id="assistantAnalyze">Interpretar</button><div id="assistantPreview" class="assistant-preview"><span class="muted">Dica: você pode escrever vários pedidos, um por linha.</span></div><div class="assistant-privacy"><b>Como funciona</b><span>Frases simples funcionam localmente. Com Firebase AI Logic ativado, pedidos mais complexos usam IA e retornam ações estruturadas; suas alterações continuam exigindo confirmação.</span></div></div></dialog>`);
    const d=$('#assistantDialog'),txt=$('#assistantText');$('#assistantClose').onclick=()=>d.close();$('#assistantAnalyze').onclick=()=>{const v=txt.value.trim();if(!v)return toast('Escreva o que você precisa organizar.');analyzeAssistantText(v)};$$('[data-assistant-example]').forEach(b=>b.onclick=()=>{txt.value=b.dataset.assistantExample;txt.focus()});txt.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();$('#assistantAnalyze').click()}})
  }
  window.openAuvrynCapture=function(){injectAssistantDialog();assistantPlan=[];const d=$('#assistantDialog'),txt=$('#assistantText'),pv=$('#assistantPreview');txt.value='';pv.innerHTML='<span class="muted">Dica: você pode escrever vários pedidos, um por linha.</span>';d.showModal();setTimeout(()=>txt.focus(),40)};

  // ---------- BINDINGS ----------
  const baseBindRoute=bindRoute;
  bindRoute=function(r){
    baseBindRoute(r);
    $$('[data-memory-open]').forEach(b=>b.onclick=()=>go('academics/summary/'+b.dataset.memoryOpen));
    $$('[data-memory-rate]').forEach(b=>b.onclick=()=>memoryRate(b.dataset.id,b.dataset.memoryRate));
    $$('[data-open-memory]').forEach(b=>b.onclick=()=>{state.ui.academicTab='reviews';state.ui.reviewTab='queue';save();go('academics')});
    $$('[data-open-study-circles]').forEach(b=>b.onclick=()=>{state.ui.academicTab='groups';state.ui.studyCircleId='';save();go('academics')});
    $$('[data-back-academic]').forEach(b=>b.onclick=()=>{state.ui.academicTab='overview';state.ui.studyCircleId='';stopCircleListeners();save();render()});
    $$('[data-circle-create]').forEach(b=>b.onclick=()=>openCreateCircle(b.dataset.circleCreate));
    $$('[data-circle-join]').forEach(b=>b.onclick=()=>openJoinCircle(b.dataset.circleJoin));
    $$('[data-circle-open]').forEach(b=>b.onclick=()=>{state.ui.studyCircleId=b.dataset.circleOpen;state.ui.studyCirclePanel='room';save();render()});
    $$('[data-circle-back]').forEach(b=>b.onclick=()=>{state.ui.studyCircleId='';state.ui.studyCirclePanel='room';stopCircleListeners();save();render()});
    $$('[data-circle-panel]').forEach(b=>b.onclick=()=>{state.ui.studyCirclePanel=b.dataset.circlePanel||'room';save();render()});
    $$('[data-copy-circle-code]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copyCircleCode);toast('Código copiado')}catch(e){toast(`Código: ${b.dataset.copyCircleCode}`)}});
    $$('[data-circle-study-start]').forEach(b=>b.onclick=()=>openStudySession(b.dataset.circleStudyStart));
    const stop=$('#stopCircleStudy');if(stop)stop.onclick=stopStudyCircleSession;
    $$('[data-study-link-add]').forEach(b=>b.onclick=()=>openStudyLink(b.dataset.studyLinkAdd));
    $$('[data-circle-link-open]').forEach(b=>b.onclick=()=>{const url=validSharedUrl(b.dataset.circleLinkOpen);if(!url)return toast('Link inválido.');window.open(url,'_blank','noopener,noreferrer')});
    $$('[data-circle-file-delete]').forEach(b=>b.onclick=()=>deleteStudyCircleFile(b.dataset.circleId,b.dataset.circleFileDelete));
    $$('[data-circle-challenge]').forEach(b=>b.onclick=()=>openChallenge(b.dataset.circleChallenge,b.dataset.circleType));
    $$('[data-circle-leave]').forEach(b=>b.onclick=()=>leaveCircle(b.dataset.circleType,b.dataset.circleLeave));
    $$('[data-circle-settings]').forEach(b=>b.onclick=()=>openCircleSettings(b.dataset.circleSettings));
    $$('[data-circle-message-form]').forEach(f=>f.onsubmit=e=>{e.preventDefault();const inp=f.querySelector('[name=message]'),text=inp.value;inp.value='';postCircleMessage(f.dataset.circleMessageForm,text)});
  };



  // Fallback de navegação: mantém as abas funcionais mesmo após re-renderizações assíncronas.
  document.addEventListener('click',e=>{
    const a=e.target.closest?.('[data-academic-tab]');if(a){state.ui.academicTab=a.dataset.academicTab;save();render();return}
    const r=e.target.closest?.('[data-review-tab]');if(r){state.ui.academicTab='reviews';state.ui.reviewTab=r.dataset.reviewTab;save();render();return}
    const g=e.target.closest?.('[data-open-study-circles]');if(g){state.ui.academicTab='groups';state.ui.studyCircleId='';save();go('academics');return}
  });

  // Keep review metadata consistent for old/new summaries.
  ensureMemoryAll();
  if(!('studyCircleId' in state.ui))state.ui.studyCircleId='';if(!('studyCirclePanel' in state.ui))state.ui.studyCirclePanel='room';delete state.ui.moveCircleId;
  injectCircleDialogs();injectAssistantDialog();
  window.addEventListener('hashchange',()=>{const r=currentRoute(),deep=routeParts()[1];const inStudy=r==='academics'&&state.ui.academicTab==='groups'&&state.ui.studyCircleId;if(!inStudy)stopCircleListeners()});

  // When the auth state changes, clear social cache so another account never inherits it.
  try{const a=getFirebaseAuth();let lastCircleAuthUid='';if(a)a.onAuthStateChanged(user=>{
    const nextUid=user?.uid||'',accountChanged=!!lastCircleAuthUid&&nextUid!==lastCircleAuthUid;
    circleCache.ownerUid=nextUid;circleCache.generation++;
    circleCache.study=null;circleCache.details.clear();circleCache.loading.clear();stopCircleListeners();
    // A lista de grupos vive no Firestore da própria conta. Apenas a seleção visual
    // é limpa ao trocar de usuário; as memberships continuam persistidas na nuvem.
    state.ui.studyCircleId='';state.ui.studyCirclePanel='room';delete state.ui.moveCircleId;
    if(accountChanged){try{localStorage.removeItem(ACTIVE_STUDY_KEY)}catch(e){}}
    lastCircleAuthUid=nextUid;
    try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}
    if(user&&!document.body.classList.contains('auth-locked'))setTimeout(()=>render(),0);
  })}catch(e){}

  bootAuth();
};
