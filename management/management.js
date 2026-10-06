'use strict';
const $ = s => document.querySelector(s);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sessionKey = 'livingstones-management-session';
let auth = null, stones = [], selected = null, record = null, tab = 'finds', noticeTimer;
let section='management',statsPeriod='30',statsTarget='all',statsData=null,statsRun=0;
const qrCache=new Map(),qrLabelCodes=new Map();
if (location.protocol === 'http:' && !['localhost','127.0.0.1'].includes(location.hostname)) location.replace('https:'+location.href.slice(5));
try { auth = JSON.parse(sessionStorage.getItem(sessionKey)); } catch {}
function notice(message, error=false) {
  const el=$('#notice'); el.textContent=message; el.classList.toggle('error',error);el.hidden=false;
  clearTimeout(noticeTimer); noticeTimer=setTimeout(()=>el.hidden=true,7000);
}
function signedOut() {
  qrLabelCodes.clear();auth=null;sessionStorage.removeItem(sessionKey);stones=[];selected=null;
  statsRun++;statsData=null;$('#admin-tabs').hidden=true;$('#management-panel').hidden=true;$('#statistics').hidden=true;
  $('#login').hidden=false;$('#dashboard').hidden=true;$('#editor').hidden=true;$('#logout').hidden=true;
  if ($('#record-dialog').open) $('#record-dialog').close();
}
async function api(path,method='GET',body) {
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
  try {
    const response=await fetch(LIVINGSTONES_API+'/api/admin/'+path,{method,credentials:'omit',cache:'no-store',signal:controller.signal,headers:{...(auth?{Authorization:'Bearer '+auth.token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();
    if (!response.ok) {
      if(response.status===401 && path!=='login') signedOut();
      throw new Error(data.error || 'The request could not be completed.');
    }
    return data;
  } catch (error) {
    if(error.name==='AbortError'||error instanceof TypeError) throw new Error('Could not reach management. Your changes have not been confirmed; try again.');
    throw error;
  } finally {clearTimeout(timer);}
}
const imageURL = s => new URL(s.image,new URL('../docs/assets/',location.href)).href;
const formatDate = value => new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value));
const formatMoment = value => new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const statsHTML = items => items.map(([number,label])=>`<div><strong>${number}</strong><span>${label}</span></div>`).join('');
function renderList() {
  const query=$('#search').value.trim().toLocaleLowerCase(),type=$('#type-filter').value,sort=$('#sort').value;
  const all=[...stones].filter(s=>(type==='all'||s.demo===(type==='demo'))&&[s.name,s.id,s.finds.at(-1)?.city].join(' ').toLocaleLowerCase().includes(query));
  all.sort((a,b)=>sort==='views'?(b.views-a.views||a.name.localeCompare(b.name)):sort==='name'?a.name.localeCompare(b.name):Date.parse(b.finds.at(-1)?.date)-Date.parse(a.finds.at(-1)?.date)||a.id.localeCompare(b.id));
  $('#summary').innerHTML=statsHTML([[stones.length,'Stones'],[stones.reduce((n,s)=>n+s.finds.length,0),'Finds'],[stones.reduce((n,s)=>n+(s.views||0),0),'Story views'],[stones.filter(s=>!s.demo).length,'Real stones']]);
  $('#stone-list').innerHTML=all.map(s=>{
    const last=s.finds.at(-1);
    return `<button class="admin-stone-card" data-stone="${escapeHTML(s.id)}"><img src="${escapeHTML(imageURL(s))}" alt=""><span class="card-copy"><strong>${escapeHTML(s.name)}<span class="stone-type ${s.demo?'':'real'}">${s.demo?'Demo':'Real'}</span></strong><span class="card-meta">${escapeHTML(s.id)} · Born ${formatDate(s.started)}</span><span class="card-meta">${last?escapeHTML(last.city)+' · '+formatDate(last.date):'No finds'}</span><span class="card-numbers"><span><b>${s.finds.length}</b> finds</span><span><b>${s.views||0}</b> views</span></span></span><span class="card-arrow" aria-hidden="true">↗</span></button>`;
  }).join('') || '<p>No stones match your search.</p>';
}
function field(name,label,value,type='text',extra='') {
  return `<label>${label}<input name="${name}" type="${type}" value="${escapeHTML(value)}" ${extra}></label>`;
}
function selectField(name,label,options,value) {
  return `<label>${label}<select name="${name}">${options.map(([v,l])=>`<option value="${v}" ${v===value?'selected':''}>${l}</option>`).join('')}</select></label>`;
}
function renderEditor() {
  const s=stones.find(s=>s.id===selected);if(!s){showList();return;}
  $('#editor').hidden=false;$('#dashboard').hidden=true;
  $('#editor').innerHTML=`<div class="editor-top"><button data-action="back">← All stones</button><img src="${escapeHTML(imageURL(s))}" alt=""><div><h1>${escapeHTML(s.name)}</h1><a href="../?stone=${encodeURIComponent(s.id)}" target="_blank" rel="noopener">Open public story ↗</a></div><button class="danger" data-action="delete-stone">Delete stone</button></div>
    <div class="editor-grid"><div><section class="panel"><h2>Stone details</h2><p class="form-hint">ID: ${escapeHTML(s.id)} · ${s.views||0} story views</p><form id="stone-form"><div class="field-grid">
    ${field('name','Name',s.name,'text','required maxlength="80"')}${field('creator','Painted by',s.creator,'text','required maxlength="80"')}${field('started','Born',s.started,'date','required')}${selectField('demo','Type',[['demo','Demo'],['real','Real']],s.demo?'demo':'real')}
    <label class="wide">Image path or HTTPS URL<input name="image" value="${escapeHTML(s.image)}" required maxlength="300"></label>
    ${selectField('theme','Theme',[['sun','Sun'],['moon','Moon'],['leaf','Leaf'],['heart','Heart'],['wave','Wave']],s.theme)}${field('color','Map pin colour',s.color,'color')}
    <label class="wide">${s.demo?'Find Code':'New private Find Code (optional)'}<input name="code" type="text" value="${s.demo?escapeHTML(s.code):''}" autocomplete="off" maxlength="32" pattern="[A-Za-z0-9]{4,32}"></label>
    </div><p class="form-hint">A blank code keeps the current one. Demo codes are public. When changing Demo to Real, enter a new private code.</p><div class="form-actions"><button type="submit" class="primary">Save stone</button></div></form></section>${qrPanel(s)}<section class="panel"><h2>The journey in numbers</h2><div class="admin-stats">${statsHTML([[Math.max(0,Math.floor((Date.now()-Date.parse(s.started))/86400000)),'Days alive'],[s.finds.length,'Finds'],[new Set(s.finds.map(f=>f.country)).size,'Countries'],[s.views||0,'Views']])}</div><p class="form-hint">Views count story openings, including repeat visits. Existing example counts were not imported.</p></section></div>
    <section class="panel"><h2>Their memories</h2><div class="record-buttons"><button data-tab="finds" ${tab==='finds'?'class="primary"':''}>Finds (${s.finds.length})</button><button data-tab="comments" ${tab==='comments'?'class="primary"':''}>Comments (${s.comments.length})</button></div><div id="records">${recordsHTML(s)}</div></section></div>`;
}
function recordsHTML(s) {
  if(tab==='comments') return [...s.comments].reverse().map(c=>`<article class="admin-record"><div class="admin-record-head"><span>${formatMoment(c.date)} · ${c.findId?'Find note':'Standalone note'}</span><strong>${escapeHTML(c.nickname)}</strong></div><p>${escapeHTML(c.message)}</p><div class="record-buttons"><button data-edit-comment="${escapeHTML(c.id)}">Edit comment</button><button class="danger" data-delete-comment="${escapeHTML(c.id)}">Delete comment</button></div></article>`).join('')||'<p>No comments yet.</p>';
  return [...s.finds].reverse().map(f=>{
    const c=s.comments.find(c=>c.findId===f.id),birth=f.id===s.finds[0]?.id;
    return `<article class="admin-record"><div class="admin-record-head"><span>${formatMoment(f.date)}${birth?' · Birth':''}</span><strong>${escapeHTML(f.nickname)}</strong></div><p><b>${escapeHTML(f.city)}, ${escapeHTML(f.country)}</b></p><p class="record-address">${escapeHTML(f.address)} · ${escapeHTML(f.source)}${f.accuracy!=null?' ~'+Math.round(f.accuracy)+'m':''}</p><p>${escapeHTML(f.message||'No note attached.')}</p><div class="record-buttons"><button data-edit-find="${escapeHTML(f.id)}">Edit find</button>${c?`<button data-edit-comment="${escapeHTML(c.id)}">Edit comment</button>`:''}${birth?'':`<button class="danger" data-delete-find="${escapeHTML(f.id)}">Delete find</button>`}</div></article>`;
  }).join('')||'<p>No finds yet.</p>';
}
function showList() {
  selected=null;history.replaceState(null,'',location.pathname);$('#editor').hidden=true;$('#dashboard').hidden=false;renderList();
}
function updateSection() {
  $('#management-panel').hidden=section!=='management';$('#statistics').hidden=section!=='stats';
  for(const button of document.querySelectorAll('[data-section]')){
    const active=button.dataset.section===section;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  }
}
async function load() {
  const data=await api('stones');stones=data.stones;
  $('#login').hidden=true;$('#logout').hidden=false;$('#admin-tabs').hidden=false;
  const params=new URLSearchParams(location.hash.slice(1));
  section=params.get('tab')==='stats'?'stats':'management';
  selected=selected||params.get('stone');
  if(selected&&stones.some(s=>s.id===selected))renderEditor();else{selected=null;$('#editor').hidden=true;$('#dashboard').hidden=false;renderList();}
  updateSection();
  if(section==='stats'){
    statsPeriod=['7','30','90','all'].includes(params.get('period'))?params.get('period'):statsPeriod;
    statsTarget=params.get('target')||statsTarget;await loadStats();
  }
}
function qrFor(stone){
  if(!qrCache.has(stone.id)){
    const qr=qrcode(0,'H');qr.addData('https://livingstones.rodulab.com/?stone='+encodeURIComponent(stone.id),'Byte');qr.make();qrCache.set(stone.id,qr);
  }
  return qrCache.get(stone.id);
}
function labelCode(stone){return stone.demo?stone.code:qrLabelCodes.get(stone.id)||'';}
function qrPanel(stone){
  const code=labelCode(stone),qr=qrFor(stone),url='https://livingstones.rodulab.com/?stone='+encodeURIComponent(stone.id);
  return `<section class="panel qr-panel"><h2>A little doorway to my story</h2><p class="form-hint">High error correction (H). Keep the white border when printing.</p><div class="stone-qr" data-error-correction="H" data-quiet-zone="4">${qr.createSvgTag({cellSize:4,margin:16,scalable:true,title:'Public story QR for '+stone.name})}</div>${code?`<p class="qr-find-code"><span>Find Code</span><strong>${escapeHTML(code)}</strong></p>`:`<form class="qr-code-form" id="qr-code-form"><label>Find Code<input name="code" autocomplete="off" required maxlength="32" pattern="[A-Za-z0-9]{4,32}"></label><p class="form-hint">Enter the existing code to add it to the label. It is kept only for this signed-in session.</p><button type="submit">Show Find Code</button></form>`}<a class="qr-link" href="${escapeHTML(url)}" target="_blank" rel="noopener">${escapeHTML(url)}</a><div class="qr-actions"><button data-download-qr="svg">Download SVG</button><button data-download-qr="png">Download PNG</button></div></section>`;
}
function qrLabelSVG(stone){
  const qr=qrFor(stone),code=labelCode(stone),size=(qr.getModuleCount()+8)*4;
  const svg=qr.createSvgTag({cellSize:4,margin:16,scalable:true,title:'Public story QR for '+stone.name});
  if(!code)return svg;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size+32}"><rect width="100%" height="100%" fill="white"/>${svg.replace('<svg ','<svg width="'+size+'" height="'+size+'" ')}<text x="${size/2}" y="${size+18}" text-anchor="middle" font-family="sans-serif" font-size="${Math.min(12,size/(code.length+11)*1.5)}" fill="black">Find Code: ${escapeHTML(code)}</text></svg>`;
}
async function downloadQR(format){
  const stone=stones.find(s=>s.id===selected),qr=qrFor(stone);let blob;
  if(format==='svg')blob=new Blob([qrLabelSVG(stone)],{type:'image/svg+xml'});
  else{
    const scale=24,count=qr.getModuleCount(),canvas=document.createElement('canvas');const code=labelCode(stone);canvas.width=(count+8)*scale;canvas.height=canvas.width+(code?192:0);
    const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.fillStyle='#000';
    for(let row=0;row<count;row++)for(let col=0;col<count;col++)if(qr.isDark(row,col))context.fillRect((col+4)*scale,(row+4)*scale,scale,scale);
    if(code){context.font='bold '+Math.min(72,Math.floor(canvas.width/(code.length+11)*1.5))+'px sans-serif';context.textAlign='center';context.fillText('Find Code: '+code,canvas.width/2,canvas.width+110);}
    blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  }
  if(!blob)throw new Error('Could not prepare the QR download.');
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=stone.id+'-qr-H.'+format;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function loadStats(){
  const run=++statsRun;$('#stats-status').hidden=false;$('#stats-status').textContent='Loading visits…';
  for(const id of ['traffic-summary','daily-chart','cumulative-chart','traffic-ranking'])$('#'+id).replaceChildren();
  try{
    const data=await api('stats?period='+statsPeriod);
    if(run!==statsRun||!auth)return;statsData=data;
    if(section==='stats')renderStats();
  }catch(error){if(run===statsRun){$('#stats-status').textContent=error.message;$('#stats-status').hidden=false;}}
}
function renderStats(){
  if(!statsData)return;$('#stats-status').hidden=true;
  const options=[['all','All visits'],['home','Homepage'],['stories','All stone stories'],...statsData.targets.filter(t=>t.kind==='stone').map(t=>[t.key,t.name+(t.deleted?' (deleted)':'')])];
  if(!options.some(([key])=>key===statsTarget))statsTarget='all';
  $('#stats-target').innerHTML=options.map(([key,name])=>`<option value="${escapeHTML(key)}" ${statsTarget===key?'selected':''}>${escapeHTML(name)}</option>`).join('');
  for(const button of document.querySelectorAll('[data-period]'))button.setAttribute('aria-pressed',String(button.dataset.period===statsPeriod));
  const result=StoneStats.series(statsData,statsTarget),format=n=>n.toLocaleString('en-GB');
  $('#traffic-summary').innerHTML=statsHTML([[format(result.total),'All-time opens'],[format(result.inRange),'Opens in this period'],[format(result.today),'Today'],[(result.inRange/Math.max(1,result.days.length)).toFixed(1),'Daily average']]);
  const width=matchMedia('(max-width:700px)').matches?600:1000;
  $('#daily-chart').innerHTML=StoneStats.chart(result.days,'daily',width);$('#cumulative-chart').innerHTML=StoneStats.chart(result.days,'cumulative',width);
  $('#daily-chart-detail').textContent=result.inRange?'Hover, tap or focus a point to see its count.':'No recorded opens in this period yet.';
  $('#cumulative-chart-detail').textContent='Hover, tap or focus a point to see its count.';
  const rangeCounts=new Map();for(const row of statsData.days)rangeCounts.set(row.target,(rangeCounts.get(row.target)||0)+row.views);
  $('#traffic-ranking').innerHTML=`<table class="traffic-table"><thead><tr><th scope="col">Page / stone</th><th scope="col">This period</th><th scope="col">All time</th></tr></thead><tbody>${[...statsData.targets].sort((a,b)=>(rangeCounts.get(b.key)||0)-(rangeCounts.get(a.key)||0)||a.name.localeCompare(b.name)).map(t=>`<tr><td><button data-stats-target="${escapeHTML(t.key)}">${escapeHTML(t.name)}${t.deleted?' <span class="stone-type">Deleted</span>':''}</button></td><td>${format(rangeCounts.get(t.key)||0)}</td><td>${format(t.totalViews)}</td></tr>`).join('')}</tbody></table>`;
  $('#tracking-note').textContent='Homepage tracking started '+formatDate(statsData.since)+'. Counts are opens, not unique people. Days use UTC. Stone totals retain earlier recorded views.';
  history.replaceState(null,'','#'+new URLSearchParams({tab:'stats',period:statsPeriod,target:statsTarget}));
}
function updateStone(data) {if(data.stone)stones=stones.map(s=>s.id===data.stone.id?data.stone:s);renderEditor();}
async function withButton(button,action) {
  if(button.disabled)return;button.disabled=true;
  try {await action();}catch(e){notice(e.message,true);}finally{if(button.isConnected)button.disabled=false;}
}
function openRecord(kind,id) {
  const s=stones.find(s=>s.id===selected);record={kind,id};const item=(kind==='finds'?s.finds:s.comments).find(r=>r.id===id);record.date=item.date;
  $('#record-title').textContent=kind==='finds'?'Edit find':'Edit comment';$('#record-error').hidden=true;
  let form;
  if(kind==='comments')form=`${field('nickname','Finder name',item.nickname,'text','required maxlength="40"')}<label>Comment<textarea name="message" required maxlength="400">${escapeHTML(item.message)}</textarea></label>`;
  else form=`<div class="field-grid">${field('date','Date / time (UTC)',new Date(item.date).toISOString().slice(0,19),'datetime-local','required step="1"')}${field('nickname','Finder name',item.nickname,'text','required maxlength="40"')}${field('city','City',item.city,'text','required maxlength="120"')}${field('country','Country',item.country,'text','required maxlength="80"')}<label class="wide">Address<input name="address" value="${escapeHTML(item.address)}" maxlength="300"></label>${field('lat','Latitude',item.lat,'number','required step="any" min="-90" max="90"')}${field('lon','Longitude',item.lon,'number','required step="any" min="-180" max="180"')}${selectField('source','Location source',[['seed','Original / birth'],['gps','GPS'],['manual','Manual'],['demo','Demo']],item.source)}${field('accuracy','GPS accuracy (metres)',item.accuracy??'','number','step="any" min="0"')}</div>`;
  $('#record-form').innerHTML=form+'<div class="form-actions"><button type="button" data-action="cancel-record">Cancel</button><button type="submit" class="primary">Save changes</button></div>';
  $('#record-dialog').showModal();
}
$('#login-form').addEventListener('submit',event=>{
  event.preventDefault();withButton(event.submitter,async()=>{const data=await api('login','POST',{password:$('#password').value});auth=data;sessionStorage.setItem(sessionKey,JSON.stringify(auth));$('#password').value='';await load();notice('Signed in. Welcome back.');});
});
$('#logout').addEventListener('click',event=>withButton(event.currentTarget,async()=>{try {await api('logout','POST',{});} finally {signedOut();}notice('Signed out.');}));
$('#refresh').addEventListener('click',event=>withButton(event.currentTarget,async()=>{await load();notice('Latest stories loaded.');}));
for(const selector of ['#search','#type-filter','#sort'])$(selector).addEventListener(selector==='#search'?'input':'change',renderList);
$('#refresh-stats').addEventListener('click',event=>withButton(event.currentTarget,loadStats));
$('#stats-target').addEventListener('change',event=>{statsTarget=event.target.value;renderStats();});
$('#statistics').addEventListener('focusin',showChartDetail);
$('#statistics').addEventListener('pointerover',showChartDetail);
$('#statistics').addEventListener('click',showChartDetail);
function showChartDetail(event){const point=event.target.closest('[data-chart-label]');if(point)point.closest('.chart-panel').querySelector('.chart-detail').textContent=point.dataset.chartLabel;}
$('#admin-tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...document.querySelectorAll('[data-section]')];const next=event.key==='Home'?buttons[0]:event.key==='End'?buttons.at(-1):buttons.find(button=>button!==document.activeElement);next?.focus();next?.click();});
window.addEventListener('resize',()=>{if(section==='stats'&&statsData)renderStats();});
$('#close-record').addEventListener('click',()=>$('#record-dialog').close());
$('#record-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;$('#record-error').hidden=true;
  const body=Object.fromEntries(new FormData(event.currentTarget));
  if(record.kind==='finds'){const editedDate=new Date(body.date+'Z').toISOString();body.date=editedDate.slice(0,19)===new Date(record.date).toISOString().slice(0,19)?record.date:editedDate;body.lat=Number(body.lat);body.lon=Number(body.lon);body.accuracy=body.accuracy===''?null:Number(body.accuracy);}
  try {const data=await api(`stones/${selected}/${record.kind}/${record.id}`,'PATCH',body);$('#record-dialog').close();updateStone(data);notice('Changes saved.');}catch(e){$('#record-error').textContent=e.message;$('#record-error').hidden=false;}finally{button.disabled=false;}
});
$('#editor').addEventListener('submit',event=>{
  if(event.target.id==='qr-code-form'){
    event.preventDefault();withButton(event.submitter,async()=>{const code=new FormData(event.target).get('code');const data=await api('stones/'+selected+'/label-code','POST',{code});qrLabelCodes.set(selected,data.code);renderEditor();});return;
  }
  if(event.target.id!=='stone-form')return;event.preventDefault();const body=Object.fromEntries(new FormData(event.target));body.demo=body.demo==='demo';withButton(event.submitter,async()=>{const data=await api('stones/'+selected,'PATCH',body);if(body.code)qrLabelCodes.set(selected,body.code.toUpperCase());updateStone(data);notice('Stone saved.');});
});
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.downloadQr){withButton(button,()=>downloadQR(button.dataset.downloadQr));return;}
  if(button.dataset.section){
    section=button.dataset.section;updateSection();
    if(section==='stats'){history.replaceState(null,'','#'+new URLSearchParams({tab:'stats',period:statsPeriod,target:statsTarget}));loadStats();}
    else{history.replaceState(null,'',selected?'#stone='+selected:location.pathname);if(selected)renderEditor();else showList();}
    return;
  }
  if(button.dataset.period){statsPeriod=button.dataset.period;loadStats();return;}
  if(button.dataset.statsTarget){statsTarget=button.dataset.statsTarget;renderStats();return;}
  if(button.dataset.stone){selected=button.dataset.stone;tab='finds';history.replaceState(null,'','#stone='+selected);renderEditor();$('#editor h1').setAttribute('tabindex','-1');$('#editor h1').focus();return;}
  if(button.dataset.tab){tab=button.dataset.tab;renderEditor();return;}
  if(button.dataset.action==='back'){showList();return;}
  if(button.dataset.action==='cancel-record'){$('#record-dialog').close();return;}
  if(button.dataset.editFind){openRecord('finds',button.dataset.editFind);return;}
  if(button.dataset.editComment){openRecord('comments',button.dataset.editComment);return;}
  const stone=stones.find(s=>s.id===selected);
  if(button.dataset.action==='delete-stone'){
    if(!confirm(`Delete ${stone.name} and all its finds and comments? Historical traffic totals will remain. This cannot be undone.`))return;
    withButton(button,async()=>{await api('stones/'+selected,'DELETE');selected=null;await load();notice('Stone deleted.');});return;
  }
  const kind=button.dataset.deleteFind?'finds':button.dataset.deleteComment?'comments':null,id=button.dataset.deleteFind||button.dataset.deleteComment;
  if(kind&&confirm(kind==='finds'?'Delete this find and its attached comment? This cannot be undone.':'Delete this comment? The find will remain.'))withButton(button,async()=>{const data=await api(`stones/${selected}/${kind}/${id}`,'DELETE');updateStone(data);notice('Record deleted.');});
});
(async()=>{if(!auth||auth.expiresAt<=Math.floor(Date.now()/1000)){signedOut();return;}try{await load();}catch(e){notice(e.message,true);if(auth)signedOut();}})();
