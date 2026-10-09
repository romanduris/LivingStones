'use strict';
const $=selector=>document.querySelector(selector);
const id=new URL(location.href).searchParams.get('stone');
const assetBase=new URL('../docs/assets/',location.href);
let images=[],place=null,requestKey=null,gpsRun=0,portraitRun=0;
let cityTimer,cityController,birthMap=null;
const themes={
  sun:['Sun · a little sunshine','A warm golden background for a cheerful little friend.',1],
  moon:['Moon · a little wonder','A soft purple background for a curious little dreamer.',2],
  leaf:['Leaf · a little nature','A gentle green background for a friend of the outdoors.',3],
  heart:['Heart · a little kindness','A warm rose background for sharing little moments of kindness.',4],
  wave:['Wave · a little adventure','A calm blue background for a little explorer on the move.',5],
};
const storyURL=()=>new URL('../?'+new URLSearchParams({stone:id,source:'qr'}),location.href).href;
function status(message,error=false){$('#form-status').textContent=message;$('#form-status').classList.toggle('error',error);}
async function api(suffix='',body,key){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(LIVINGSTONES_API+'/api/stones/'+encodeURIComponent(id)+suffix,{method:body?'POST':'GET',credentials:'omit',cache:'no-store',signal:controller.signal,headers:body?{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})}:{},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();
    if(!response.ok){const error=new Error(data.error||'Please try again.');error.status=response.status;throw error;}
    return data;
  }catch(error){
    if(error.name==='AbortError'||error instanceof TypeError)throw new Error('We couldn’t confirm the request. Your form is still here — please try again.');
    throw error;
  }finally{clearTimeout(timer);}
}
function updateBirthButton(){
  $('#give-birth').disabled=!place||!$('#portrait-options input:checked')||$('#birth-fields').disabled;
}
function selectedPortrait(){return images.find(image=>image.id===$('#portrait-options input:checked')?.value);}
function updatePreview(){
  $('#preview-name').textContent=$('#stone-name').value.trim()||'Your little travelling friend';
  const image=selectedPortrait();$('#hero-portrait').src=new URL(image?.image||'brand-stone.svg',assetBase).href;
  const theme=$('#stone-theme').value,[title,description,example]=themes[theme];
  $('#theme-swatch').className='theme-swatch theme-'+theme;
  $('#theme-portrait').src=new URL(image?.image||`stone-${example}.svg`,assetBase).href;
  $('#theme-preview-title').textContent=title;$('#theme-preview-copy').textContent=description;
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
      const picture=document.createElement('img');picture.src=new URL(image.image,assetBase).href;picture.alt='Painted stone: '+image.label;picture.width=340;picture.height=280;
      const caption=document.createElement('span');caption.textContent=image.label;
      label.append(radio,picture,caption);$('#portrait-options').append(label);
    }
    $('#pool-status').textContent=data.available?`${data.available} unique portraits available · showing ${images.length}`:'All portraits are currently assigned. Please contact the Living Stones owner for more portraits.';
    requestKey=null;updatePreview();
  }finally{if(run===portraitRun)button.disabled=false;}
}
async function boot(){
  $('#retry-page').hidden=true;$('#page-status').classList.remove('error');
  $('#page-status').hidden=false;$('#page-status').textContent='Finding your little stone…';
  try{
    if(!id||! /^[A-Za-z0-9_-]{1,32}$/.test(id))throw new Error('Scan the QR code on your new stone to open its setup page.');
    const {stone}=await api();
    if(stone.initialized!==false){location.replace(storyURL());return;}
    await loadImages();
    $('#birth-date').textContent=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric'}).format(new Date());
    $('#page-status').hidden=true;$('#birth-form').hidden=false;
  }catch(error){$('#page-status').textContent=error.message;$('#page-status').classList.add('error');$('#retry-page').hidden=false;}
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
  $('#location-status').textContent=!place?'No location selected yet.':place.source==='manual'?`Manual city location: ${place.city}, ${place.country} · approximate location`:`${place.city}, ${place.country} · GPS accuracy ~${Math.round(place.accuracy)} m`;
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
  searchStatus.textContent=query.length<2?'Type at least two letters.':'Searching cities…';
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
          input.value=city;results.replaceChildren();searchStatus.textContent='City selected — approximate location.';
          setBirthPlace({lat,lon,city,country,address:'Approximate city location',source:'manual',accuracy:null});
        };
        results.append(button);
      }
      searchStatus.textContent=results.children.length?'Choose your city below.':'No matching cities. Try a different spelling.';
    }catch{if(valid())searchStatus.textContent='City search is unavailable. Try typing again or use GPS.';}
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
  try{await loadImages();status('Choose a portrait from your new selection.');}catch(error){status(error.message,true);}
});
$('#use-birth-gps').addEventListener('click',async()=>{
  const button=$('#use-birth-gps'),code=$('#find-code');
  if(button.disabled)return;
  if(!code.reportValidity())return;
  button.disabled=true;const run=++gpsRun;setBirthPlace(null);
  $('#location-status').textContent='Checking the Find Code…';
  try{
    cancelCitySearch();
    await api('/verify',{code:code.value});
    if(run!==gpsRun)return;
    if(!navigator.geolocation)throw new Error('Location is unavailable here. Open this page on your phone.');
    $('#location-status').textContent='Waiting for your phone’s location permission…';
    const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:0}));
    if(run!==gpsRun)return;
    $('#location-status').textContent='Finding the name of your birthplace…';
    const address=await lookupPlace(position.coords);if(run!==gpsRun)return;
    $('#manual-city').value='';$('#city-results').replaceChildren();
    setBirthPlace({lat:position.coords.latitude,lon:position.coords.longitude,accuracy:position.coords.accuracy,source:'gps',...address});
    status('Your birthplace is ready. When you’re happy with the details, let your stone be born.');
  }catch(error){
    if(run!==gpsRun)return;
    const message=error.code===1?'Location permission was declined. Allow it in your browser settings, then try again.':error.code===2||error.code===3?'Your phone couldn’t find its location. Try again with a clear GPS signal.':error.message;
    $('#location-status').textContent=message||'Please try requesting your phone location again.';
  }finally{if(run===gpsRun)button.disabled=false;updateBirthButton();}
});
$('#birth-form').addEventListener('submit',async event=>{
  event.preventDefault();if($('#birth-fields').disabled)return;
  if(!place||!selectedPortrait()){status('Choose a portrait and a birthplace first.',true);return;}
  const body=Object.fromEntries(new FormData(event.currentTarget));body.place=place;
  cancelCitySearch();
  requestKey ||= crypto.randomUUID();
  $('#birth-fields').disabled=true;$('#give-birth').textContent='Beginning your story…';status('Saving your stone and its first memory…');
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
    status(error.message,true);
  }finally{
    $('#birth-fields').disabled=false;$('#give-birth').textContent='Let my stone be born ✦';updateBirthButton();
  }
});
boot();
