'use strict';
const $=selector=>document.querySelector(selector);
const id=new URL(location.href).searchParams.get('stone');
const assetBase=new URL('../docs/assets/',location.href);
let images=[],place=null,requestKey=null,gpsRun=0,portraitRun=0;
let cityTimer,cityController,birthMap=null;
const themes={sun:1,moon:2,leaf:3,heart:4,wave:5};
const locales={en:'en-GB',sk:'sk-SK',hu:'hu-HU',de:'de-DE'};
let language='en';
try { language=localStorage.getItem('livingstones-birth-language')||navigator.language.slice(0,2); } catch {}
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
  try{localStorage.setItem('livingstones-birth-language',language);}catch{}
  document.documentElement.lang=language;document.title=t('pageTitle');
  for(const node of document.querySelectorAll('[data-i18n]'))if(node.id!=='give-birth')node.textContent=t(node.dataset.i18n);
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
  $('#give-birth').disabled=!place||!$('#portrait-options input:checked')||$('#birth-fields').disabled;
}
function selectedPortrait(){return images.find(image=>image.id===$('#portrait-options input:checked')?.value);}
function updatePreview(){
  $('#preview-name').textContent=$('#stone-name').value.trim()||t('friend');
  const image=selectedPortrait();$('#hero-portrait').src=new URL(image?.image||'brand-stone.svg',assetBase).href;
  const theme=$('#stone-theme').value,example=themes[theme],capital=theme[0].toUpperCase()+theme.slice(1);
  $('#theme-swatch').className='theme-swatch theme-'+theme;
  $('#theme-portrait').src=new URL(image?.image||`stone-${example}.svg`,assetBase).href;
  $('#theme-preview-title').textContent=t('themeOption'+capital);$('#theme-preview-copy').textContent=t('themeCopy'+capital);
  updateBirthButton();
}
async function loadImages(){
  const run=++portraitRun,button=$('#refresh-portraits');button.disabled=true;
  try{
    const data=await api('/images');if(run!==portraitRun)return;
    images=data.images;
    $('#portrait-options').replaceChildren();
    for(const image of images){
      const label=document.createElement('label');label.className='portrait-option';
      const radio=document.createElement('input');radio.type='radio';radio.name='imageId';radio.value=image.id;radio.required=true;
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
    await loadImages();
    $('#birth-date').textContent=new Intl.DateTimeFormat(locales[language],{day:'numeric',month:'long',year:'numeric'}).format(new Date());
    $('#page-status').hidden=true;$('#birth-form').hidden=false;
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
    const valid=()=>cityController===request&&input.value.trim()===query&&!$('#birth-fields').disabled;
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
$('#retry-page').addEventListener('click',boot);
$('#birth-form').addEventListener('input',()=>{requestKey=null;updatePreview();});
$('#portrait-options').addEventListener('change',()=>{const image=selectedPortrait();if(image)$('#stone-theme').value=image.theme;updatePreview();});
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
    status('placeReady');
  }catch(error){
    if(run!==gpsRun)return;
    showMessage('#location-status',error.code===1?'gpsDenied':error.code===2||error.code===3?'gpsFailed':errorKey(error));
  }finally{if(run===gpsRun)button.disabled=false;updateBirthButton();}
});
$('#birth-form').addEventListener('submit',async event=>{
  event.preventDefault();if($('#birth-fields').disabled)return;
  if(!place||!selectedPortrait()){status('needPlace',true);return;}
  const body=Object.fromEntries(new FormData(event.currentTarget));body.place=place;
  cancelCitySearch();
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
        await loadImages();
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
