'use strict';
const $=selector=>document.querySelector(selector);
const id=new URL(location.href).searchParams.get('stone');
const assetBase=new URL('../docs/assets/',location.href);
let images=[],place=null,requestKey=null,gpsRun=0,portraitRun=0;
let cityTimer,cityController,birthMap=null,currentStep=1,wizardBusy=false,verifiedCode=null;
let cameraZoom=1,cameraBaseZoom=1,cameraBusy=false,cameraAdjustments=Promise.resolve(),cameraAdjustment=0;
let photo=null,cameraStream=null,photoRun=0,uploadURL=null,photoZoom=3;
const stoneOutline=new Path2D('M 51 9 C 73 7 87 24 90 43 C 96 64 81 85 62 90 C 41 97 18 85 11 66 C 5 47 12 25 28 15 C 35 10 43 11 51 9 Z');
const locales={en:'en-GB',sk:'sk-SK',hu:'hu-HU',de:'de-DE'};
let language='en';
language=(navigator.language||'en').toLowerCase().split(/[-_]/)[0];
if(language==='cs')language='sk';
if(!locales[language])language='en';
const messages=new Map();
function t(key,params={}){return (BIRTH_TRANSLATIONS[language][key]||BIRTH_TRANSLATIONS.en[key]||key).replace(/\{(\w+)\}/g,(_,name)=>params[name]??'');}
function showMessage(selector,key,params={}){messages.set(selector,{key,params});$(selector).textContent=t(key,params);}
function errorKey(error){
  if(error.i18nKey)return error.i18nKey;
  const aliases={'That Find Code does not match.':'codeWrong','That code doesn’t match this stone. Check the back of the stone.':'codeWrong'};
  return aliases[error.message]||Object.keys(BIRTH_TRANSLATIONS.en).find(key=>BIRTH_TRANSLATIONS.en[key]===error.message)||'genericError';
}
function localizedError(key){const error=new Error(t(key));error.i18nKey=key;return error;}
function portraitLabel(image){
  if(!image.id.startsWith('birth-'))return image.label;
  const [palette,theme]=image.label.split(' ');
  return t('palette'+palette)+' · '+t('theme'+theme);
}
function setLanguage(value){
  language=locales[value]?value:'en';
  document.documentElement.lang=language;document.title=t('pageTitle');
  for(const node of document.querySelectorAll('[data-i18n]'))if(!['give-birth','birth-next'].includes(node.id))node.textContent=t(node.dataset.i18n);
  for(const [attribute,target] of [['i18nPlaceholder','placeholder'],['i18nAlt','alt'],['i18nAria','aria-label']]){
    const name=attribute.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
    for(const node of document.querySelectorAll('[data-'+name+']'))node.setAttribute(target,t(node.dataset[attribute]));
  }
  $('#birth-language-label').textContent=language.toUpperCase();
  $('#birth-language-flag').src=new URL('flags/'+(language==='en'?'gb':language)+'.svg',assetBase).href;
  for(const button of document.querySelectorAll('[data-birth-language]'))button.setAttribute('aria-current',String(button.dataset.birthLanguage===language));
  for(const [selector,message] of messages)$(selector).textContent=t(message.key,message.params);
  for(const [index,node] of [...$('#portrait-options').children].entries()){
    const label=portraitLabel(images[index]);node.querySelector('span').textContent=label;node.querySelector('img').alt=t('portraitAlt',{label});
  }
  $('#birth-date').textContent=new Intl.DateTimeFormat(locales[language],{day:'numeric',month:'long',year:'numeric'}).format(new Date());
  $('#give-birth').textContent=t($('#birth-fields').disabled?'savingButton':'giveBirth');updatePreview();
}
const storyURL=()=>new URL('../?'+new URLSearchParams({stone:id,source:'qr'}),location.href).href;
function status(key,error=false,params={}){showMessage('#form-status',key,params);$('#form-status').classList.toggle('error',error);}
async function api(suffix='',body,key){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(LIVINGSTONES_API+'/api/stones/'+encodeURIComponent(id)+suffix,{method:body?'POST':'GET',credentials:'omit',cache:'no-store',signal:controller.signal,headers:body?{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})}:{},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();
    if(!response.ok){const error=new Error(data.error||'Please try again.');error.status=response.status;throw error;}
    return data;
  }catch(error){
    if(error.name==='AbortError'||error instanceof TypeError)throw localizedError('connection');
    throw error;
  }finally{clearTimeout(timer);}
}
function updateBirthButton(){
  const disabled=$('#birth-fields').disabled;
  $('#use-birth-gps').classList.toggle('primary',!place);
  $('#use-birth-gps').classList.toggle('secondary',Boolean(place));
  $('#give-birth').disabled=!place||!(photo||selectedPortrait())||disabled;
  $('#birth-next').disabled=disabled||wizardBusy||(currentStep===2&&(!(photo||selectedPortrait())||!$('#photo-editor').hidden));
  $('#birth-next').textContent=t(wizardBusy?'checkingCode':'next');
  $('#birth-back').disabled=disabled||wizardBusy;
}
function selectedPortrait(){return images.find(image=>image.id===$('#portrait-options input:checked')?.value);}
function updatePreview(){
  const image=photo|| (selectedPortrait()?new URL(selectedPortrait().image,assetBase).href:null);
  $('#stone-photo-preview').hidden=!image;
  if(image){$('#photo-portrait').src=image;$('#summary-portrait').src=image;}
  $('#summary-name').textContent=$('#stone-name').value.trim();updateBirthButton();
}
function showStep(step,focus=true){
  if(currentStep===2&&step!==2)stopPhotoEditor();
  if(currentStep===3&&step!==3){cancelCitySearch();++gpsRun;$('#use-birth-gps').disabled=false;}
  currentStep=step;$('.birth-intro').hidden=step!==1;
  for(const panel of document.querySelectorAll('[data-step]'))panel.hidden=Number(panel.dataset.step)!==step;
  for(const item of document.querySelectorAll('[data-progress]')){
    if(Number(item.dataset.progress)===step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');
    item.dataset.complete=String(Number(item.dataset.progress)<step);
  }
  $('#birth-back').hidden=step===1;$('#birth-next').hidden=step===3;$('#give-birth').hidden=step!==3;
  updatePreview();requestAnimationFrame(()=>{birthMap?.invalidateSize();if(focus){$('#birth-step-'+step+' h2').focus({preventScroll:true});$('.birth-wrap').scrollIntoView({behavior:'auto',block:'start'});}});
}
function validateName(){
  for(const input of [$('#stone-name'),$('#stone-creator'),$('#find-code')])if(!input.checkValidity()){if(currentStep!==1)showStep(1,false);input.reportValidity();return false;}
  return true;
}
$('#birth-next').addEventListener('click',async()=>{
  if(wizardBusy||$('#birth-fields').disabled)return;
  if(currentStep===1){
    if(!validateName())return;
    wizardBusy=true;updateBirthButton();status('checkingCode');
    try{if(verifiedCode!==$('#find-code').value){await api('/verify',{code:$('#find-code').value});verifiedCode=$('#find-code').value;}status('');showStep(2);}
    catch(error){status(errorKey(error),true);$('#find-code').focus();}
    finally{wizardBusy=false;updateBirthButton();}
  }else if(currentStep===2){if(!(photo||selectedPortrait())){status('choosePhoto',true);return;}status('');showStep(3);}
});
$('#birth-back').addEventListener('click',()=>{if(!wizardBusy&&!$('#birth-fields').disabled){status('');showStep(currentStep-1);}});
async function loadImages(){
  const run=++portraitRun,button=$('#refresh-portraits');button.disabled=true;
  try{
    const data=await api('/images');if(run!==portraitRun)return;
    images=data.images;
    $('#portrait-options').replaceChildren();
    for(const image of images){
      const label=document.createElement('label');label.className='portrait-option';
      const radio=document.createElement('input');radio.type='radio';radio.name='imageId';radio.value=image.id;
      const picture=document.createElement('img');picture.src=new URL(image.image,assetBase).href;picture.alt=t('portraitAlt',{label:portraitLabel(image)});picture.width=340;picture.height=280;
      const caption=document.createElement('span');caption.textContent=portraitLabel(image);
      label.append(radio,picture,caption);$('#portrait-options').append(label);
    }
    showMessage('#pool-status',data.available?'pool':'poolEmpty',{available:data.available,shown:images.length});
    requestKey=null;updatePreview();
  }finally{if(run===portraitRun)button.disabled=false;}
}
async function boot(){
  $('#retry-page').hidden=true;$('#page-status').classList.remove('error');
  $('#page-status').hidden=false;showMessage('#page-status','finding');
  try{
    if(!id||! /^[A-Za-z0-9_-]{1,32}$/.test(id))throw localizedError('scan');
    const {stone}=await api();
    if(stone.initialized!==false){location.replace(storyURL());return;}
    $('#birth-date').textContent=new Intl.DateTimeFormat(locales[language],{day:'numeric',month:'long',year:'numeric'}).format(new Date());
    $('#page-status').hidden=true;$('#birth-form').hidden=false;showStep(1,false);
  }catch(error){showMessage('#page-status',errorKey(error));$('#page-status').classList.add('error');$('#retry-page').hidden=false;}
}
async function lookupPlace(coords){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(`https://photon.komoot.io/reverse?lat=${coords.latitude}&lon=${coords.longitude}&radius=1&limit=1`,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
    if(!response.ok)throw new Error('lookup');
    const data=await response.json(),p=data.features?.[0]?.properties;
    if(!p)throw new Error('empty');
    return {city:p.city||p.town||p.village||p.county||`${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`,country:p.country||'GPS location',address:[p.street,p.housenumber,p.district].filter(Boolean).join(', ')};
  }catch{return {city:`${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`,country:'GPS location',address:''};}
  finally{clearTimeout(timer);}
}
function cancelCitySearch(){clearTimeout(cityTimer);cityController?.abort();cityController=null;}
function setBirthPlace(value){
  place=value;requestKey=null;
  showMessage('#location-status',!place?'noPlace':place.source==='manual'?'manualPlace':'gpsPlace',place?{...place,accuracy:Math.round(place.accuracy)}:{});
  const frame=$('#birth-location-preview-frame');frame.hidden=!place;
  if(birthMap){birthMap.remove();birthMap=null;}
  if(place){
    birthMap=L.map('birth-location-preview',{scrollWheelZoom:false}).setView([place.lat,place.lon],place.source==='manual'?11:15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(birthMap);
    L.circleMarker([place.lat,place.lon],{radius:8,color:'#b49aff',fillColor:'#b49aff',fillOpacity:.85}).addTo(birthMap);
    if(place.source==='gps'&&place.accuracy>0)L.circle([place.lat,place.lon],{radius:place.accuracy,color:'#b49aff',weight:1,fillOpacity:.12}).addTo(birthMap);
    requestAnimationFrame(()=>birthMap?.invalidateSize());
  }
  updateBirthButton();
}
$('#choose-city').addEventListener('click',()=>{
  cancelCitySearch();gpsRun++;$('#use-birth-gps').disabled=false;
  $('#manual-location').hidden=false;$('#choose-city').setAttribute('aria-expanded','true');
  if(place?.source!=='manual')setBirthPlace(null);
  $('#manual-city').focus();
});
$('#manual-city').addEventListener('input',()=>{
  cancelCitySearch();gpsRun++;$('#use-birth-gps').disabled=false;
  const input=$('#manual-city'),results=$('#city-results'),searchStatus=$('#city-search-status'),query=input.value.trim();
  results.replaceChildren();setBirthPlace(null);
  showMessage('#city-search-status',query.length<2?'typeTwo':'searching');
  if(query.length<2)return;
  cityTimer=setTimeout(async()=>{
    const request=cityController=new AbortController(),timer=setTimeout(()=>request.abort(),8000);
    const valid=()=>cityController===request&&input.value.trim()===query&&!$('#birth-fields').disabled&&currentStep===3;
    try{
      const url=new URL('https://photon.komoot.io/api/');url.search=new URLSearchParams({q:query,limit:'6',lang:'en',layer:'city'});
      const response=await fetch(url,{signal:request.signal});if(!response.ok)throw new Error('search');
      const data=await response.json();if(!valid())return;
      const seen=new Set();
      for(const feature of data.features||[]){
        const [lon,lat]=feature.geometry?.coordinates||[],p=feature.properties||{},city=p.name||p.city,country=p.country;
        if(!city||!country||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||feature.geometry?.type!=='Point')continue;
        const label=[city,p.state,country].filter(Boolean).join(', ');if(seen.has(label))continue;seen.add(label);
        const button=document.createElement('button');button.type='button';button.className='city-result';button.textContent=label;
        button.onclick=()=>{
          if(!valid())return;cancelCitySearch();gpsRun++;
          input.value=city;results.replaceChildren();showMessage('#city-search-status','citySelected');
          setBirthPlace({lat,lon,city,country,address:'Approximate city location',source:'manual',accuracy:null});
          $('#manual-location').hidden=true;$('#choose-city').setAttribute('aria-expanded','false');
        };
        results.append(button);
      }
      showMessage('#city-search-status',results.children.length?'chooseCity':'noCities');
    }catch{if(valid())showMessage('#city-search-status','searchFailed');}
    finally{clearTimeout(timer);}
  },350);
});
$('#manual-city').addEventListener('keydown',event=>{
  if(['Enter','ArrowDown'].includes(event.key)){event.preventDefault();$('#city-results button')?.focus();}
});
$('#city-results').addEventListener('keydown',event=>{
  if(!['ArrowDown','ArrowUp','Escape'].includes(event.key))return;
  event.preventDefault();if(event.key==='Escape'){$('#manual-city').focus();return;}
  const buttons=[...$('#city-results').querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
  buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
});
function cameraCapabilities(track){try{return track?.getCapabilities?.()||{};}catch{return {};}}
async function applyCameraSetting(track,setting){
  const constraints=track.getConstraints?.()||{};
  await track.applyConstraints({...constraints,advanced:[{...Object.assign({},...(constraints.advanced||[])),...setting}]});
}
function renderPhotoScale(){
  $('.photo-stage').style.setProperty('--photo-scale',String(Math.max(1,photoZoom/(cameraStream?cameraZoom:1))));
  $('.photo-stage').dataset.zoom=String(photoZoom);
}
function cameraControls(){
  const video=$('#stone-camera'),ready=cameraStream?video.videoWidth>0:$('#uploaded-photo').naturalWidth>0;
  $('#capture-stone-photo').disabled=cameraBusy||!ready;
  $('#focus-stone-photo').disabled=cameraBusy;
  for(const button of document.querySelectorAll('[data-photo-zoom]'))button.disabled=cameraBusy;
}
function stopPhotoEditor(){
  ++photoRun;++cameraAdjustment;cameraAdjustments=Promise.resolve();cameraStream?.getTracks().forEach(track=>track.stop());cameraStream=null;
  cameraZoom=cameraBaseZoom=1;cameraBusy=false;
  $('#stone-camera').srcObject=null;$('#stone-camera').hidden=true;
  $('#uploaded-photo').hidden=true;$('#uploaded-photo').removeAttribute('src');
  if(uploadURL)URL.revokeObjectURL(uploadURL);uploadURL=null;
  $('#photo-editor').hidden=true;$('#stone-photo-actions').hidden=false;document.body.dataset.photoEditing='false';
  $('#focus-stone-photo').hidden=true;$('#camera-tip').hidden=true;
  for(const button of document.querySelectorAll('[data-photo-zoom]'))button.disabled=false;
  $('#capture-stone-photo').disabled=true;$('#capture-stone-photo').textContent=t('capturePhoto');renderPhotoScale();updateBirthButton();
}
function scrollToPhoto(selector){requestAnimationFrame(()=>$(selector).scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'}));}
function openPhotoEditor(){
  $('#design-picker').hidden=true;$('#choose-stone-design').setAttribute('aria-expanded','false');
  $('#photo-editor').hidden=false;$('#stone-photo-actions').hidden=true;document.body.dataset.photoEditing='true';
  $('#stone-photo-preview').hidden=true;renderPhotoScale();updateBirthButton();scrollToPhoto('#photo-editor');
}
async function setCameraZoom(run){
  const track=cameraStream?.getVideoTracks()[0];if(!track||run!==photoRun)return;
  const range=cameraCapabilities(track).zoom;
  const reportedZoom=track.getSettings?.().zoom;
  if(range&&Number.isFinite(range.min)&&Number.isFinite(range.max)&&Number.isFinite(reportedZoom)&&reportedZoom>0){
    const wanted=Math.max(range.min,Math.min(range.max,cameraBaseZoom*photoZoom));
    const step=range.step||1,target=range.min+Math.round((wanted-range.min)/step)*step;
    try{await applyCameraSetting(track,{zoom:Math.max(range.min,Math.min(range.max,target))});}catch{}
  }
  if(run!==photoRun)return;
  const actual=track.getSettings?.().zoom;
  cameraZoom=Number.isFinite(actual)&&actual>0?actual/cameraBaseZoom:1;
  renderPhotoScale();
}
function queueCameraZoom(){
  const run=photoRun,adjustment=++cameraAdjustment;cameraBusy=true;cameraControls();
  cameraAdjustments=cameraAdjustments.catch(()=>{}).then(async()=>{
    if(run!==photoRun)return;await setCameraZoom(run);
    if(run===photoRun&&adjustment===cameraAdjustment){cameraBusy=false;cameraControls();}
  });
  return cameraAdjustments;
}
$('#take-stone-photo').addEventListener('click',async()=>{
  stopPhotoEditor();const run=photoRun;showMessage('#photo-status','cameraStarting');
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw localizedError('cameraUnavailable');
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:3840},height:{ideal:2160},frameRate:{ideal:24}},audio:false});
    if(run!==photoRun){stream.getTracks().forEach(track=>track.stop());return;}
    cameraStream=stream;const track=stream.getVideoTracks()[0],caps=cameraCapabilities(track);
    cameraBaseZoom=track.getSettings?.().zoom||caps.zoom?.min||1;
    for(const key of ['focusMode','exposureMode','whiteBalanceMode'])if(caps[key]?.includes('continuous')){try{await applyCameraSetting(track,{[key]:'continuous'});}catch{}}
    if(run!==photoRun)return;
    openPhotoEditor();const video=$('#stone-camera');video.hidden=false;video.srcObject=stream;
    await video.play();if(run!==photoRun)return;
    $('#focus-stone-photo').hidden=!caps.focusMode?.some(mode=>['continuous','single-shot'].includes(mode));$('#camera-tip').hidden=false;
    await queueCameraZoom();if(run!==photoRun)return;
    showMessage('#photo-status','');cameraControls();
  }catch(error){if(run!==photoRun)return;stopPhotoEditor();showMessage('#photo-status',error.i18nKey||'cameraUnavailable');}
});
$('#focus-stone-photo').addEventListener('click',async()=>{
  if(cameraBusy)return;const track=cameraStream?.getVideoTracks()[0],run=photoRun;if(!track)return;
  cameraBusy=true;cameraControls();
  try{const modes=cameraCapabilities(track).focusMode||[];await applyCameraSetting(track,{focusMode:modes.includes('single-shot')?'single-shot':'continuous'});await new Promise(resolve=>setTimeout(resolve,450));if(run===photoRun&&modes.includes('continuous'))await applyCameraSetting(track,{focusMode:'continuous'});}catch{}
  finally{if(run===photoRun){cameraBusy=false;cameraControls();}}
});
$('#upload-stone-photo').addEventListener('click',()=>{$('#stone-photo-file').click();});
for(const button of document.querySelectorAll('[data-native-camera]'))button.addEventListener('click',()=>{stopPhotoEditor();updatePreview();$('#stone-native-file').click();});
async function loadPhotoFile(event){
  const file=event.target.files[0];event.target.value='';if(!file)return;
  stopPhotoEditor();const run=photoRun;
  if(file.size>20*1024*1024){showMessage('#photo-status','photoTooLarge');return;}
  uploadURL=URL.createObjectURL(file);const img=$('#uploaded-photo');img.src=uploadURL;
  try{await img.decode();if(run!==photoRun)return;img.hidden=false;openPhotoEditor();cameraControls();showMessage('#photo-status','');}
  catch{if(run!==photoRun)return;stopPhotoEditor();showMessage('#photo-status','photoInvalid');}
}
$('#stone-photo-file').addEventListener('change',loadPhotoFile);$('#stone-native-file').addEventListener('change',loadPhotoFile);
async function cameraPhoto(track){
  if(!window.ImageCapture)return null;
  let timer;
  try{
    const blob=await Promise.race([new ImageCapture(track).takePhoto(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),4000);})]);
    if(window.createImageBitmap)return await createImageBitmap(blob);
    const url=URL.createObjectURL(blob),img=new Image();try{img.src=url;await img.decode();return img;}finally{URL.revokeObjectURL(url);}
  }catch{return null;}finally{clearTimeout(timer);}
}
$('#capture-stone-photo').addEventListener('click',async()=>{
  if(cameraBusy)return;const run=photoRun,scale=Math.max(1,photoZoom/(cameraStream?cameraZoom:1));
  cameraBusy=true;cameraControls();$('#capture-stone-photo').textContent=t('capturingPhoto');let still=null;
  try{
    if(cameraStream)still=await cameraPhoto(cameraStream.getVideoTracks()[0]);
    if(run!==photoRun)return;
    const source=still||(cameraStream?$('#stone-camera'):$('#uploaded-photo'));
    const width=source.videoWidth||source.naturalWidth||source.width,height=source.videoHeight||source.naturalHeight||source.height;if(!width||!height)return;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=320;
    const context=canvas.getContext('2d'),side=Math.min(width,height)/scale;
    context.save();context.scale(3.2,3.2);context.clip(stoneOutline);context.scale(1/3.2,1/3.2);
    context.drawImage(source,(width-side)/2,(height-side)/2,side,side,0,0,320,320);context.restore();
    photo=canvas.toDataURL('image/png');for(const input of $('#portrait-options').querySelectorAll('input'))input.checked=false;
    requestKey=null;stopPhotoEditor();showMessage('#photo-status','');updatePreview();scrollToPhoto('#stone-photo-preview');
  }finally{still?.close?.();if(run===photoRun){cameraBusy=false;$('#capture-stone-photo').textContent=t('capturePhoto');cameraControls();}}
});
for(const button of document.querySelectorAll('[data-photo-zoom]'))button.addEventListener('click',()=>{
  photoZoom=Number(button.dataset.photoZoom);
  for(const option of document.querySelectorAll('[data-photo-zoom]'))option.setAttribute('aria-pressed',String(option===button));
  if(cameraStream)queueCameraZoom();else renderPhotoScale();
});
$('#cancel-stone-photo').addEventListener('click',()=>{stopPhotoEditor();updatePreview();showMessage('#photo-status','');});
$('#choose-stone-design').addEventListener('click',async()=>{
  stopPhotoEditor();showMessage('#photo-status','');const panel=$('#design-picker');panel.hidden=!panel.hidden;
  $('#choose-stone-design').setAttribute('aria-expanded',String(!panel.hidden));
  if(!panel.hidden&&!images.length){try{await loadImages();}catch(error){showMessage('#pool-status',errorKey(error));}}
});
window.addEventListener('pagehide',stopPhotoEditor);
$('#retry-page').addEventListener('click',boot);
$('#birth-form').addEventListener('input',()=>{requestKey=null;updatePreview();});
$('#portrait-options').addEventListener('change',()=>{photo=null;stopPhotoEditor();showMessage('#photo-status','');$('#design-picker').hidden=true;$('#choose-stone-design').setAttribute('aria-expanded','false');requestKey=null;updatePreview();});
$('#refresh-portraits').addEventListener('click',async()=>{
  try{await loadImages();status('choosePortrait');}catch(error){status(errorKey(error),true);}
});
$('#use-birth-gps').addEventListener('click',async()=>{
  const button=$('#use-birth-gps'),code=$('#find-code');
  if(button.disabled)return;
  if(!code.reportValidity())return;
  button.disabled=true;const run=++gpsRun;setBirthPlace(null);
  showMessage('#location-status','checkingCode');
  try{
    cancelCitySearch();
    await api('/verify',{code:code.value});
    if(run!==gpsRun)return;
    if(!navigator.geolocation)throw localizedError('gpsUnavailable');
    showMessage('#location-status','awaitPermission');
    const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:0}));
    if(run!==gpsRun)return;
    showMessage('#location-status','locating');
    const address=await lookupPlace(position.coords);if(run!==gpsRun)return;
    $('#manual-city').value='';$('#city-results').replaceChildren();
    setBirthPlace({lat:position.coords.latitude,lon:position.coords.longitude,accuracy:position.coords.accuracy,source:'gps',...address});
    status('');
  }catch(error){
    if(run!==gpsRun)return;
    showMessage('#location-status',error.code===1?'gpsDenied':error.code===2||error.code===3?'gpsFailed':errorKey(error));
  }finally{if(run===gpsRun)button.disabled=false;updateBirthButton();}
});
$('#birth-form').addEventListener('submit',async event=>{
  event.preventDefault();if($('#birth-fields').disabled||wizardBusy)return;
  if(currentStep!==3){$('#birth-next').click();return;}
  if(!validateName())return;
  if(!place||!(photo||selectedPortrait())){status('needPlace',true);return;}
  const body=Object.fromEntries(new FormData(event.currentTarget));body.place=place;body.theme=selectedPortrait()?.theme||'sun';if(photo){delete body.imageId;body.photo=photo;}
  stopPhotoEditor();cancelCitySearch();
  requestKey ||= crypto.randomUUID();
  $('#birth-fields').disabled=true;$('#give-birth').textContent=t('savingButton');status('saving');
  try{
    await api('/initialize',body,requestKey);
    location.replace(storyURL());
  }catch(error){
    if(error.status===409){
      try{
        const {stone}=await api();
        if(stone.initialized){location.replace(storyURL());return;}
        await loadImages();showStep(2);$('#design-picker').hidden=false;$('#choose-stone-design').setAttribute('aria-expanded','true');
      }catch{}
    }
    status(errorKey(error),true);
  }finally{
    $('#birth-fields').disabled=false;$('#give-birth').textContent=t('giveBirth');updateBirthButton();
  }
});
const languageMenu=$('#birth-language-menu'),languageSwitch=$('#birth-language-switch');
languageMenu.addEventListener('toggle',()=>{
  const open=languageMenu.matches(':popover-open');languageSwitch.setAttribute('aria-expanded',String(open));
  if(open){const rect=languageSwitch.getBoundingClientRect();languageMenu.style.top=(rect.bottom+8)+'px';languageMenu.style.left=Math.max(8,Math.min(rect.right-176,innerWidth-184))+'px';}
});
for(const button of document.querySelectorAll('[data-birth-language]'))button.addEventListener('click',()=>{setLanguage(button.dataset.birthLanguage);languageMenu.hidePopover();languageSwitch.focus();});
showMessage('#location-status','locationHelp');setLanguage(language);boot();
