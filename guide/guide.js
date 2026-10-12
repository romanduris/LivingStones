'use strict';
const guideLanguage=document.getElementById('guide-language');
function setGuideLanguage(language,updateURL=true){
  if(!Object.hasOwn(GUIDE_COPY,language))language='sk';
  const copy=GUIDE_COPY[language];
  document.documentElement.lang=language;document.title=copy.pageTitle;
  for(const element of document.querySelectorAll('[data-copy]'))element.innerHTML=copy[element.dataset.copy];
  for(const element of document.querySelectorAll('[data-alt]'))element.alt=copy[element.dataset.alt];
  for(const element of document.querySelectorAll('[data-label]'))element.setAttribute('aria-label',copy[element.dataset.label]);
  document.querySelector('meta[name=description]').content=copy.intro;
  guideLanguage.value=language;guideLanguage.setAttribute('aria-label',copy.language);
  if(updateURL){const url=new URL(location.href);url.searchParams.set('lang',language);history.replaceState(null,'',url);}
}
const requestedLanguage=new URL(location.href).searchParams.get('lang');
let browserLanguage=(navigator.language||'sk').split(/[-_]/)[0].toLowerCase();
if(browserLanguage==='cs')browserLanguage='sk';
setGuideLanguage(requestedLanguage||browserLanguage,false);
guideLanguage.addEventListener('change',()=>setGuideLanguage(guideLanguage.value));
document.getElementById('print-guide').addEventListener('click',async()=>{
  await document.fonts.ready;
  window.print();
});
