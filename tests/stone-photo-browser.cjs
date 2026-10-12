const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const server=spawn('python3',['-u','-m','http.server','8143']);
process.on('exit',()=>server.kill());
(async()=>{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
 const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try{
  for(const width of [320,390,1280]){
   const context=await browser.newContext({viewport:{width,height:900},permissions:['camera','geolocation'],geolocation:{latitude:48.148,longitude:17.107}});
   let saved=null,key=null,attempts=0;
   await context.route('http://127.0.0.1:8787/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(path.endsWith('/initialize')){
     const body=request.postDataJSON();assert.ok(body.photo.startsWith('data:image/png;base64,'));assert.equal(body.imageId,undefined);assert.equal(body.theme,'sun');
     if(key)assert.equal(request.headers()['idempotency-key'],key);key=request.headers()['idempotency-key'];saved=body;
     if(++attempts===1)return route.abort('failed');
     // Keep the test on the setup page after success, allowing payload verification.
     return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Please try again.'})});
    }
    return route.fulfill({contentType:'application/json',body:JSON.stringify(path.endsWith('/images')?{images:JSON.parse(fs.readFileSync('fixtures/birth-stones.json','utf8')).slice(0,12),available:40}:path.endsWith('/verify')?{ok:true}:{stone:{initialized:false}})});
   });
   await context.route('https://photon.komoot.io/reverse**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({features:[{properties:{city:'Bratislava',country:'Slovakia'}}]})}));
   const page=await context.newPage(),errors=[];
   await page.addInitScript(()=>{window.photoScrolls=[];const original=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(options){window.photoScrolls.push(this.id);return original.call(this,options);};});page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:8143/initialize/?stone=PHOTO123');await page.locator('#birth-form').waitFor();
   assert.equal(await page.locator('#design-picker').isVisible(),false);assert.equal(await page.locator('#stone-theme').count(),0);
   // Permission failure preserves the form and leaves upload available.
   await page.evaluate(()=>{window.originalCamera=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('denied','NotAllowedError'));});
   await page.locator('#take-stone-photo').click();await page.waitForFunction(()=>document.querySelector('#photo-status').textContent.includes('unavailable'));
   assert.equal(await page.locator('#photo-editor').isVisible(),false);
   await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async options=>{const stream=await window.originalCamera(options);window.testStream=stream;return stream;};});
   await page.locator('#take-stone-photo').click();await page.waitForFunction(()=>!document.querySelector('#capture-stone-photo').disabled);
   assert.equal(await page.locator('.stone-outline').isVisible(),true);
   await page.locator('#capture-stone-photo').click();assert.equal(await page.locator('#stone-photo-preview').isVisible(),true);
   assert.equal(await page.evaluate(()=>window.testStream.getTracks().every(t=>t.readyState==='ended')),true);
   await page.locator('#stone-photo-file').setInputFiles('fixtures/stone-photo.png');await page.waitForFunction(()=>!document.querySelector('#capture-stone-photo').disabled);
   await page.locator('#capture-stone-photo').click();
   const pixels=await page.evaluate(async()=>{const img=document.querySelector('#photo-portrait');await img.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=320;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return {corner:[...ctx.getImageData(0,0,1,1).data],center:[...ctx.getImageData(160,160,1,1).data],width:img.naturalWidth};});
   assert.equal(pixels.width,320);assert.equal(pixels.corner[3],0);assert.deepEqual(pixels.center,[200,70,40,255]);
   assert.equal(await page.locator('#hero-portrait').count(),0);
   assert.equal(await page.locator('.birth-steps li').count(),3);
   assert.equal(await page.locator('[data-photo-zoom="3"]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.evaluate(()=>window.photoScrolls.includes('photo-editor')&&window.photoScrolls.includes('stone-photo-preview')),true);
   // Cancelling another photo keeps the selected portrait.
   let photo=await page.locator('#photo-portrait').getAttribute('src');
   await page.locator('#take-stone-photo').click();await page.waitForFunction(()=>!document.querySelector('#capture-stone-photo').disabled);await page.locator('#cancel-stone-photo').click();
   assert.equal(await page.locator('#photo-portrait').getAttribute('src'),photo);
   for(const language of ['sk','hu','de','en']){await page.locator('#birth-language-switch').click();await page.locator(`[data-birth-language=${language}]`).click();assert.equal(await page.locator('#photo-portrait').getAttribute('src'),photo);}
   await page.locator('#choose-stone-design').click();await page.locator('.portrait-option input').first().check();
   assert.equal(await page.locator('#stone-photo-preview').isVisible(),false);
   await page.locator('#stone-photo-file').setInputFiles('fixtures/stone-photo.png');await page.waitForFunction(()=>!document.querySelector('#capture-stone-photo').disabled);await page.locator('#capture-stone-photo').click();
   assert.equal(await page.locator('#portrait-options input:checked').count(),0);assert.equal(await page.locator('#design-picker').isVisible(),false);
   const zoomImage=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=320;const ctx=canvas.getContext('2d');ctx.fillStyle='#0000ff';ctx.fillRect(0,0,320,320);ctx.fillStyle='#ff0000';ctx.fillRect(80,80,160,160);return canvas.toDataURL().split(',')[1];}),'base64');
   for(const [zoom,expected] of [[3,[255,0,0,255]],[1,[0,0,255,255]],[2,[255,0,0,255]],[3,[255,0,0,255]]]){
    await page.locator('#stone-photo-file').setInputFiles({name:'zoom.png',mimeType:'image/png',buffer:zoomImage});await page.waitForFunction(()=>!document.querySelector('#capture-stone-photo').disabled);
    await page.locator(`[data-photo-zoom="${zoom}"]`).click();await page.locator('#capture-stone-photo').click();
    const pixel=await page.evaluate(async()=>{const img=document.querySelector('#photo-portrait');await img.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=320;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return [...ctx.getImageData(60,160,1,1).data];});assert.deepEqual(pixel,expected,'saved crop matches '+zoom+'× preview');
   }
   photo=await page.locator('#photo-portrait').getAttribute('src');
   await page.locator('#stone-name').fill('Photo friend');await page.locator('#stone-creator').fill('Painter');await page.locator('#find-code').fill('0372');await page.locator('#use-birth-gps').click();
   await page.waitForFunction(()=>!document.querySelector('#give-birth').disabled);
   await page.locator('#give-birth').click();await page.waitForFunction(()=>document.querySelector('#form-status').textContent.includes('couldn’t confirm'));
   await page.locator('#give-birth').click();await page.waitForFunction(()=>!document.querySelector('#birth-fields').disabled);assert.equal(attempts,2);assert.equal(saved.photo,photo);assert.equal(saved.watchEmails,undefined);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:`/tmp/livingstones-photo-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);
   await context.close();
  }
  console.log('Passed: camera denial, live camera outline, capture, matching 1×/2×/3× crops and transparency, automatic scrolling, three setup steps, stopped camera tracks, cancelled retake, translated preview, photo submission retries and 320/390/1280 layouts.');
 }finally{await browser.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
