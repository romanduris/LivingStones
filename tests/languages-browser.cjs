const {chromium,devices}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{spawn}=require('node:child_process');
const fixture=vm.createContext({});vm.runInContext(fs.readFileSync('fixtures/demo-data.js','utf8')+';globalThis.stones=DEMO_STONES',fixture);
const server=spawn('python3',['-u','-m','http.server','8137']);process.on('exit',()=>server.kill());
(async()=>{await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});const browser=await chromium.launch();try{
 for(const locale of ['sk-SK','hu-HU','de-DE','fr-FR']){
  const context=await browser.newContext({...devices['iPhone 13'],locale});const stones=JSON.parse(JSON.stringify(fixture.stones));
  stones.forEach(stone=>stone.finds.forEach((find,i)=>find.id=stone.id+'-find-'+i));
  stones[0].name='Map';stones[0].creator='Finds';stones[0].finds[0].message='Close';stones[0].finds[0].nickname='Countries';
  stones[0].comments=[{id:'first-note',findId:stones[0].finds[0].id,date:stones[0].finds[0].date,nickname:'Countries',message:'Close'}];
  await context.route('http://127.0.0.1:8787/**',route=>{
   const path=new URL(route.request().url()).pathname;let result=path.endsWith('/stones')?{stones}:path.endsWith('/views')?{views:7}:{ok:true};
   if(path.endsWith('/finds')){
    const body=route.request().postDataJSON(),date=new Date().toISOString();
    stones[0].finds.push({...body.place,id:'language-find',date,nickname:body.nickname,message:body.message});
    stones[0].comments.push({id:'language-message',findId:'language-find',date,nickname:body.nickname,message:body.message});result={stone:stones[0],recordId:'language-find'};
   }
   return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  });
  await context.route('https://photon.komoot.io/api/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({features:[{geometry:{type:'Point',coordinates:[19,48]},properties:{name:'Map',country:'Slovakia'}}]})}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8137/?stone='+stones[0].id+'&source=qr');await page.locator('#stone-dialog[open]').waitFor();
  const expected=locale==='fr-FR'?'en':locale.slice(0,2);assert.equal(await page.locator('html').getAttribute('lang'),expected);
  assert.equal(await page.locator('.detail-footnote').innerText(),await page.evaluate(()=>t('From one hand to another, my story goes on.')));
  assert.equal(await page.locator('.find-action-invitation').innerText(),await page.evaluate(()=>t('Click here to keep its story going →')));
  await page.setViewportSize({width:320,height:844});
  assert.ok(await page.locator('#start-find').evaluate(button=>{
    const title=button.querySelector('.find-action-title'),invitation=button.querySelector('.find-action-invitation');
    const lines=element=>{const range=document.createRange();range.selectNodeContents(element.querySelector('[data-site-key]')||element);return range.getClientRects().length;};
    return lines(title)===1&&lines(invitation)===1&&invitation.getBoundingClientRect().top>=title.getBoundingClientRect().bottom&&
      parseFloat(getComputedStyle(title).fontSize)>parseFloat(getComputedStyle(invitation).fontSize)&&
      parseInt(getComputedStyle(title).fontWeight)>parseInt(getComputedStyle(invitation).fontWeight)&&
      button.scrollWidth<=button.clientWidth;
  }),'Two clear action lines fit at 320px in '+expected);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.locator('#detail-title .detail-title-copy').innerText(),'Map');assert.match(await page.locator('.detail-story').innerText(),/Finds/);
  assert.equal(await page.locator('[data-entry="'+stones[0].finds[0].id+'"] .entry-message').innerText(),'“Close”');
  await page.locator('#watch-stone').click();await page.locator('#watchdog-email').fill('draft@example.invalid');
  await page.setViewportSize({width:320,height:844});
  assert.ok(await page.evaluate(()=>{const save=document.querySelector('#save-watchdog').getBoundingClientRect(),close=document.querySelector('#close-watchdog').getBoundingClientRect();return Math.abs(save.top-close.top)<1&&close.left>save.right;}),'Watchdog buttons share a row at 320px in '+expected);
  await page.setViewportSize({width:390,height:844});
  await page.locator('[popovertarget=detail-language-menu]').click();await page.locator('#detail-language-menu [data-language=de]').click();
  assert.equal(await page.locator('#watchdog-email').inputValue(),'draft@example.invalid');assert.equal(await page.locator('#watchdog-panel').isVisible(),true);
  assert.equal(await page.locator('#save-watchdog').innerText(),'E-Mail speichern');assert.equal(await page.locator('.site-header .language-label').textContent(),'DE');
  await page.locator('#close-watchdog').click();await page.locator('#start-find').click();await page.locator('#find-code').fill('8451');
  await page.locator('[popovertarget=detail-language-menu]').click();await page.locator('#detail-language-menu [data-language=sk]').click();
  assert.equal(await page.locator('#find-code').inputValue(),'8451');assert.match(await page.locator('#find-title').innerText(),/Teším sa/);
  await page.locator('#find-form button[type=submit]').click();await page.locator('#choose-city').waitFor();await page.locator('#choose-city').click();await page.locator('#manual-city').fill('Map');await page.locator('.city-result').click();
  await page.locator('#location-next').click();await page.locator('#nickname').fill('Name');await page.locator('#find-message').fill('Countries <script>visitor</script>');
  for(const lang of ['hu','de','en','sk']){
   await page.locator('[popovertarget=detail-language-menu]').click();await page.locator('#detail-language-menu [data-language='+lang+']').click();
   assert.equal(await page.locator('#nickname').inputValue(),'Name');assert.equal(await page.locator('#find-message').inputValue(),'Countries <script>visitor</script>');
   assert.equal(await page.locator('#detail-title .detail-title-copy').innerText(),'Map');assert.equal(await page.locator('#find-message script').count(),0);
  }
  await page.locator('#find-form button[type=submit]').click();await page.locator('.success-panel').waitFor();
  assert.match(await page.locator('#success-title').innerText(),/Name.*urobil si mi radosť/);
  assert.equal(await page.locator('[data-entry=language-find] .entry-message').innerText(),'“Countries <script>visitor</script>”');
  assert.equal(await page.locator('.entry-message script').count(),0);
  const missing=await page.evaluate(()=>[...new Set([...document.querySelectorAll('[data-site-key]')].map(el=>el.dataset.siteKey))].filter(key=>/[A-Za-z]/.test(key)&&!(key in SITE_TRANSLATIONS.sk)));
  assert.deepEqual(missing,[],'Missing UI translations');
  const attributes=await page.evaluate(()=>[...new Set([...document.querySelectorAll('*')].flatMap(el=>['aria-label','title','placeholder','data-label'].flatMap(attr=>{const value=el.getAttribute('data-site-'+attr);return value?[JSON.parse(value).key]:[]})))].filter(key=>!(key in SITE_TRANSLATIONS.sk)));
  assert.deepEqual(attributes,[],'Missing attribute translations');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  await context.close();
 }
 console.log('Passed: browser locale/fallback, main/story/find/watchdog translations, visitor copy untouched, switching preserves drafts and location.');
}finally{await browser.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
