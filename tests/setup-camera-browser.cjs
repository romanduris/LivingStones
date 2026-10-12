const {chromium}=require('playwright'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const server=spawn('python3',['-u','-m','http.server','8151']);process.on('exit',()=>server.kill());
(async()=>{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error('Server exited '+code)));});
 const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try{
  const context=await browser.newContext({viewport:{width:320,height:740},permissions:['camera','geolocation'],geolocation:{latitude:48.148,longitude:17.107,accuracy:9}});
  await context.route('http://127.0.0.1:8787/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(new URL(route.request().url()).pathname.endsWith('/verify')?{ok:true}:{stone:{initialized:false}})}));
  await context.route('https://photon.komoot.io/reverse**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({features:[{properties:{city:'Bratislava',country:'Slovakia'}}]})}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.cameraCalls=[];window.stillTaken=0;
   const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   navigator.mediaDevices.getUserMedia=async options=>{
    window.cameraOptions=options;const stream=await original(options),track=stream.getVideoTracks()[0],originalSettings=track.getSettings.bind(track);
    let constraints={},zoom=1;
    track.getCapabilities=()=>window.noCapabilities?{}:{focusMode:['continuous','single-shot'],exposureMode:['continuous'],whiteBalanceMode:['continuous'],zoom:{min:1,max:2,step:.5}};
    track.getSettings=()=>{const settings=originalSettings();delete settings.zoom;return {...settings,...(window.noZoomSettings?{}:{zoom})};};track.getConstraints=()=>constraints;
    track.applyConstraints=async value=>{window.cameraCalls.push(value);if(window.rejectConstraints)throw new DOMException('unsupported','OverconstrainedError');constraints=value;for(const settings of value.advanced||[])if(settings.zoom)zoom=settings.zoom;};
    window.testStream=stream;
    if(window.delayCamera)return new Promise(resolve=>{window.releaseCamera=()=>resolve(stream);});
    return stream;
   };
   window.ImageCapture=class{
    async takePhoto(){
     window.stillTaken++;if(window.failStill)throw new DOMException('unavailable','NotSupportedError');
     const canvas=document.createElement('canvas');canvas.width=canvas.height=640;const ctx=canvas.getContext('2d');ctx.fillStyle='blue';ctx.fillRect(0,0,640,640);ctx.fillStyle='red';ctx.fillRect(200,200,240,240);
     return new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    }
   };
  });
  const fit=async label=>{const fits=await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight);if(!fits){await page.screenshot({path:'/tmp/livingstones-compact-overflow.png',fullPage:true});console.log(await page.evaluate(()=>({height:document.documentElement.scrollHeight,parts:[...document.querySelectorAll('.birth-header,.birth-wrap,.birth-intro,.birth-steps,.birth-panel:not([hidden]),.wizard-nav,.birth-footnote')].map(el=>({class:el.className,height:el.getBoundingClientRect().height,top:el.getBoundingClientRect().top,margin:getComputedStyle(el).margin}))})));}assert.equal(fits,true,label+' fits a 320×740 phone');};
  await page.goto('http://127.0.0.1:8151/initialize/?stone=CAMERA123');await page.locator('#birth-form').waitFor();await fit('Name step');
  await page.locator('#stone-name').fill('Camera stone');await page.locator('#stone-creator').fill('Creator');await page.locator('#find-code').fill('0372');await page.locator('#birth-next').click();await page.locator('#birth-step-2').waitFor();await fit('Photo selection');
  await page.locator('#take-stone-photo').click();await page.waitForFunction(()=>!document.querySelector('#capture-stone-photo').disabled);
  assert.equal(await page.evaluate(()=>window.cameraOptions.video.width.ideal),3840);
  assert.ok(await page.evaluate(()=>window.cameraCalls.some(c=>c.advanced.some(s=>s.focusMode==='continuous'))));
  assert.equal(await page.locator('.photo-stage').evaluate(el=>el.style.getPropertyValue('--photo-scale')),'1.5','3× uses camera zoom 2× plus a 1.5× crop');
  await fit('Live camera');await page.screenshot({path:'/tmp/livingstones-compact-camera-320.png'});
  await page.locator('#focus-stone-photo').click();await page.waitForFunction(()=>!document.querySelector('#capture-stone-photo').disabled);
  assert.ok(await page.evaluate(()=>window.cameraCalls.some(c=>c.advanced.some(s=>s.focusMode==='single-shot'))));
  assert.ok(await page.evaluate(()=>window.cameraCalls.at(-1).advanced.some(s=>s.focusMode==='continuous'&&s.zoom===2)),'manual focusing returns to continuous focus and preserves the camera zoom');
  await page.locator('#capture-stone-photo').click();await page.locator('#stone-photo-preview').waitFor();
  const pixels=await page.evaluate(async()=>{const img=document.querySelector('#photo-portrait');await img.decode();const c=document.createElement('canvas');c.width=c.height=320;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return {left:[...ctx.getImageData(50,160,1,1).data],center:[...ctx.getImageData(160,160,1,1).data]};});
  assert.deepEqual(pixels.left,[0,0,255,255],'native zoom is not applied twice to the saved still');assert.deepEqual(pixels.center,[255,0,0,255]);assert.equal(await page.evaluate(()=>window.stillTaken),1);await fit('Selected photo');
  await page.evaluate(()=>{window.noZoomSettings=true;window.cameraCalls=[];});
  await page.locator('#take-stone-photo').click();await page.waitForFunction(()=>!document.querySelector('#capture-stone-photo').disabled);
  assert.equal(await page.locator('.photo-stage').evaluate(el=>el.style.getPropertyValue('--photo-scale')),'3');assert.equal(await page.evaluate(()=>window.cameraCalls.some(c=>c.advanced.some(s=>s.zoom!==undefined))),false,'camera zoom is used only when its setting can be verified');
  await page.locator('#capture-stone-photo').click();await page.locator('#stone-photo-preview').waitFor();
  await page.evaluate(()=>{window.noZoomSettings=false;window.noCapabilities=true;window.failStill=true;});
  await page.locator('#take-stone-photo').click();await page.waitForFunction(()=>!document.querySelector('#capture-stone-photo').disabled);assert.equal(await page.locator('#focus-stone-photo').isVisible(),false);
  await page.locator('#capture-stone-photo').click();await page.locator('#stone-photo-preview').waitFor();assert.equal(await page.locator('#photo-portrait').evaluate(img=>img.naturalWidth),320,'unsupported still capture falls back to the video frame');
  await page.locator('#take-stone-photo').click();await page.waitForFunction(()=>!document.querySelector('#capture-stone-photo').disabled);
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('[data-native-camera]:visible').click()]);
  assert.equal(await page.evaluate(()=>window.testStream.getTracks().every(t=>t.readyState==='ended')),true,'native camera releases the live camera first');assert.equal(await page.locator('#stone-native-file').getAttribute('capture'),'environment');
  await chooser.setFiles('fixtures/stone-photo.png');await page.waitForFunction(()=>!document.querySelector('#capture-stone-photo').disabled);await page.locator('#capture-stone-photo').click();await page.locator('#stone-photo-preview').waitFor();
  const previous=await page.locator('#photo-portrait').getAttribute('src');await page.evaluate(()=>{window.delayCamera=true;});await page.locator('#take-stone-photo').click();await page.waitForFunction(()=>typeof window.releaseCamera==='function');
  await page.locator('#birth-back').click();await page.locator('#birth-step-1').waitFor();await page.evaluate(()=>window.releaseCamera());await page.waitForFunction(()=>window.testStream.getTracks().every(t=>t.readyState==='ended'));
  assert.equal(await page.locator('#stone-name').inputValue(),'Camera stone');await page.locator('#birth-next').click();await page.locator('#birth-step-2').waitFor();assert.equal(await page.locator('#photo-portrait').getAttribute('src'),previous);
  await page.locator('#birth-next').click();await page.locator('#birth-step-3').waitFor();await fit('Activation step');await page.locator('#use-birth-gps').click();await page.waitForFunction(()=>!document.querySelector('#give-birth').disabled);await fit('Activation with a selected location');assert.deepEqual(errors,[]);
  console.log('Passed: 320×740 compact steps, high-resolution camera request, continuous and single-shot focus, native zoom without double cropping, still-photo and video fallback, phone camera handoff, cancelled permissions and preserved drafts.');
  await context.close();
 }finally{await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
