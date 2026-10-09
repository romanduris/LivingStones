'use strict';
// Only source templates and explicitly marked UI messages are translated.
// Visitor text is inserted afterwards and is never used as a translation key.
const siteI18n=(()=>{
 const supported={en:'en-GB',sk:'sk-SK',hu:'hu-HU',de:'de-DE'};
 let language=(navigator.language||'en').toLowerCase().split(/[-_]/)[0];
 if(!supported[language])language='en';
 const generated=new Map();
 const attributes=['aria-label','title','placeholder','data-label'];
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function text(key,values=[]){
  key=String(key??'');
  const result=(SITE_TRANSLATIONS[language][key]||key).replace(/\{(\d+)\}/g,(_,i)=>values[i]??'');
  generated.set(result,{key,values});return result;
 }
 function decode(value){const node=document.createElement('textarea');node.innerHTML=String(value??'');return node.value;}
 function source(raw,values){
  const slots=[],key=raw.replace(/__LS_SLOT_(\d+)__/g,(_,i)=>{slots.push(decode(values[i]));return '{'+(slots.length-1)+'}';}).trim().replace(/\s+/g,' ');
  return {key,values:slots};
 }
 function annotate(root,values=[]){
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  // Split interpolated HTML fragments away from adjacent UI text. They carry
  // their own markers and must never become visible literal markup.
  for(let index=0;index<nodes.length;index++){
   const node=nodes[index];
   if(!/__LS_SLOT_\d+__/.test(node.textContent))continue;
   if(![...node.textContent.matchAll(/__LS_SLOT_(\d+)__/g)].some(match=>/<[a-z][\s>]/i.test(String(values[match[1]]))||/<[a-z][a-z-]*\s/i.test(String(values[match[1]]))))continue;
   const fragment=document.createDocumentFragment(),parts=node.textContent.split(/(__LS_SLOT_\d+__)/g),replacement=[];
   for(const part of parts){if(!part)continue;const textNode=document.createTextNode(part);fragment.append(textNode);replacement.push(textNode);}
   node.replaceWith(fragment);nodes.splice(index,1,...replacement);index+=replacement.length-1;
  }
  for(const node of nodes){
   if(!node.parentElement||node.parentElement.closest('script,style,svg,noscript,[data-language],.language-label,[data-site-key]'))continue;
   const message=source(node.textContent,values);
   if(!/[A-Za-z]/.test(message.key.replace(/\{\d+\}/g,''))||message.key==='Living Stones')continue;
   const target=node.parentElement.tagName==='OPTION'?node.parentElement:document.createElement('span');
   target.dataset.siteKey=message.key;target.dataset.siteValues=JSON.stringify(message.values);
   const prefix=node.textContent.match(/^\s*/)[0],suffix=node.textContent.match(/\s*$/)[0];
   target.dataset.sitePrefix=prefix;target.dataset.siteSuffix=suffix;
   target.textContent=prefix+text(message.key,message.values)+suffix;
   if(target!==node.parentElement)node.replaceWith(target);
  }
  for(const element of root.querySelectorAll('*')){
   if(element.closest('svg,script,style,[data-language]'))continue;
   for(const attribute of attributes){
    if(!element.hasAttribute(attribute))continue;
    const message=source(element.getAttribute(attribute),values);
    if(!/[A-Za-z]/.test(message.key.replace(/\{\d+\}/g,'')))continue;
    element.setAttribute('data-site-'+attribute,JSON.stringify(message));element.setAttribute(attribute,text(message.key,message.values));
   }
  }
 }
 function ui(strings,...values){
  const template=document.createElement('template');
  template.innerHTML=strings.reduce((html,part,i)=>html+part+(i<values.length?'__LS_SLOT_'+i+'__':''),'');
  annotate(template.content,values);
  return template.innerHTML.replace(/__LS_SLOT_(\d+)__=""/gi,(_,i)=>values[i]??'').replace(/__LS_SLOT_(\d+)__/gi,(_,i)=>values[i]??'');
 }
 function say(element,key,values=[]){
  const message=Object.hasOwn(SITE_TRANSLATIONS.en,key)?{key,values}:generated.get(key)||{key,values};
  element.dataset.siteKey=message.key;element.dataset.siteValues=JSON.stringify(message.values);element.textContent=text(message.key,message.values);
 }
 function fragment(key,values=[]){return '<span data-site-key="'+escape(key)+'" data-site-values="'+escape(JSON.stringify(values))+'">'+escape(text(key,values))+'</span>';}
 function apply(root=document){
  for(const element of root.querySelectorAll('[data-site-key]'))element.textContent=(element.dataset.sitePrefix||'')+text(element.dataset.siteKey,JSON.parse(element.dataset.siteValues||'[]'))+(element.dataset.siteSuffix||'');
  for(const attribute of attributes)for(const element of root.querySelectorAll('[data-site-'+attribute+']')){
   const message=JSON.parse(element.getAttribute('data-site-'+attribute));element.setAttribute(attribute,text(message.key,message.values));
  }
  for(const time of root.querySelectorAll('time[datetime]')){
   const value=time.getAttribute('datetime');if(!Number.isFinite(Date.parse(value))||time.closest('.card-location,.overview-location'))continue;
   const hasClock=time.textContent.includes(' · ');time.textContent=date(value)+(hasClock?' · '+new Intl.DateTimeFormat(supported[language],{hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'');
  }
  document.documentElement.lang=language;document.title=text('Living Stones — Small stones. Big stories.');
  for(const button of root.querySelectorAll('.language-switch')){
   button.querySelector('.language-label').textContent=language.toUpperCase();button.querySelector('.language-flag').src=new URL('assets/flags/'+(language==='en'?'gb':language)+'.svg',document.querySelector('script[src*="i18n.js"]').src).href;
  }
  for(const button of root.querySelectorAll('[data-language]'))button.setAttribute('aria-current',String(button.dataset.language===language));
 }
 function setLanguage(value){language=supported[value]?value:'en';apply();document.dispatchEvent(new CustomEvent('site-language-change'));}
 function date(value){return new Intl.DateTimeFormat(supported[language],{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value));}
 annotate(document.body);apply();
 return {ui,text,say,fragment,apply,setLanguage,date,get language(){return language;},get locale(){return supported[language];}};
})();
const ui=siteI18n.ui,t=siteI18n.text,say=siteI18n.say,uiText=siteI18n.fragment;
