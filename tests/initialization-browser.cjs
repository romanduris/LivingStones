const {chromium,devices}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {spawn}=require('node:child_process');
const fixture=vm.createContext({});
vm.runInContext(fs.readFileSync('fixtures/demo-data.js','utf8')+';globalThis.stones=DEMO_STONES',fixture);
const catalog=JSON.parse(fs.readFileSync('fixtures/birth-stones.json','utf8'));
const server=spawn('python3',['-u','-m','http.server','8137']);
process.on('exit',()=>server.kill());
(async()=>{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error('Server exited '+code)));});
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of [390,1280]){
   const context=await browser.newContext({...(width===390?devices['iPhone 13']:{}),viewport:{width,height:900},permissions:['geolocation'],geolocation:{latitude:48.148,longitude:17.107,accuracy:9}});
   const stones=JSON.parse(JSON.stringify(fixture.stones));
   stones.forEach(s=>{s.initialized=true;s.creator=s.finds[0].nickname;s.comments=[];});
   const stone={id:'SNEW123',name:'New stone',creator:'',started:'',initialized:false,image:'brand-stone.svg',theme:'sun',color:'#b49aff',demo:false,finds:[],comments:[],views:0};
   let available=[...catalog],selection=0,firstConflict=true,loseReply=true,birthKey=null,birthWrites=0;
   let createAttempts=0,createKey=null;
   const token='b'.repeat(64);
   await context.route('https://photon.komoot.io/reverse**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({features:[{properties:{city:'Bratislava',country:'Slovakia',street:'Birth street',housenumber:'1'}}]})}));
   await context.route('http://127.0.0.1:8787/**',async route=>{
    const req=route.request(),parts=new URL(req.url()).pathname.split('/'),kind=parts[4],body=req.method()==='POST'?req.postDataJSON():null;
    let result={stones:[...stones,...(stone.initialized?[stone]:[])]},status=200;
    if(parts[2]==='admin'){
     if(parts[3]==='login')result={token,expiresAt:Math.floor(Date.now()/1000)+14400};
     else if(req.headers().authorization!=='Bearer '+token){status=401;result={error:'Please sign in.'};}
     else if(parts[3]==='logout')result={ok:true};
     else if(req.method()==='POST'){
      createAttempts++;assert.ok(req.headers()['idempotency-key']);
      if(createKey)assert.equal(req.headers()['idempotency-key'],createKey);else createKey=req.headers()['idempotency-key'];
      if(createAttempts===1)return route.abort('failed');
      result={stone,code:'ABCDEF123456'};
     }else result={stones:[...stones,stone]};
    }else if(parts[2]==='page-views')result={ok:true};
    else if(kind==='images'){
     const offset=selection++%Math.max(1,available.length-10);
     result={images:available.slice(offset,offset+10),available:available.length};
    }else if(kind==='verify'){
     if(body.code!=='ABCDEF123456'){status=403;result={error:'That Find Code does not match.'};}else result={ok:true};
    }else if(kind==='initialize'){
     if(firstConflict){
      firstConflict=false;available=available.filter(a=>a.id!==body.imageId);status=409;result={error:'Someone just chose that portrait. Please choose another one.'};
     }else{
      if(birthKey){assert.equal(req.headers()['idempotency-key'],birthKey);result={stone,replayed:true};}
      else{
       birthKey=req.headers()['idempotency-key'];birthWrites++;
       const image=catalog.find(a=>a.id===body.imageId),date=new Date().toISOString();
       Object.assign(stone,{initialized:true,name:body.name,creator:body.creator,image:image.image,theme:body.theme,color:image.color,started:date.slice(0,10),finds:[{...body.place,id:'birth-'+stone.id,date,nickname:body.creator,message:''}]});
       result={stone,replayed:false};
      }
      if(loseReply){loseReply=false;return route.abort('failed');}
     }
    }else if(kind==='views'){stone.views++;result={views:stone.views};}
    else if(parts[3]===stone.id)result={stone};
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(result)});
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{
    window.__gpsRequests=0;const original=navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition=(...args)=>{window.__gpsRequests++;return original(...args);};
   });
   // A failed create response can be retried without creating two labels.
   await page.goto('http://127.0.0.1:8137/management/');
   await page.locator('#password').fill('test-only');await page.locator('#login-form button').click();
   await page.locator('#create-stone').waitFor();await page.locator('#create-stone').click();
   await page.locator('#notice.error').waitFor();await page.locator('#create-stone').click();
   await page.locator('.stone-qr').waitFor();
   assert.equal(createAttempts,2);assert.equal(await page.locator('.stone-qr .qr-code-value').textContent(),'ABCDEF123456');
   assert.equal(await page.locator('#stone-form').count(),0);
   assert.equal(await page.locator('.qr-link').getAttribute('href'),'https://livingstones.rodulab.com/?stone=SNEW123&source=qr');
   assert.equal(await page.locator('a[href="../initialize/?stone=SNEW123"]').count(),1);
   await page.locator('[data-action=back]').click();await page.locator('#type-filter').selectOption('new');assert.equal(await page.locator('.admin-stone-card').count(),1);
   assert.match(await page.locator('.admin-stone-card').innerText(),/awaiting birth/);
   await page.locator('#logout').click();
   // The very same printed QR opens setup until the birth is saved.
   await page.goto('http://127.0.0.1:8137/?stone=SNEW123&source=qr');
   await page.waitForURL('**/initialize/?stone=SNEW123');await page.locator('#birth-form').waitFor();
   assert.equal(await page.locator('.portrait-option').count(),10);
   assert.match(await page.locator('#pool-status').textContent(),/40/);
   assert.equal(await page.evaluate(()=>window.__gpsRequests),0);
   assert.equal(await page.locator('#give-birth').isDisabled(),true);
   await page.locator('#stone-name').fill('Pebble <hello>');await page.locator('#stone-creator').fill('Painter <friend>');
   await page.locator('#find-code').fill('WRONG');await page.locator('#use-birth-gps').click();
   await page.waitForFunction(()=>document.querySelector('#location-status').textContent.includes('does not match'));
   assert.equal(await page.evaluate(()=>window.__gpsRequests),0);
   await page.locator('#find-code').fill('ABCDEF123456');
   // A declined GPS request preserves the form and can be retried.
   await page.evaluate(()=>{const original=navigator.geolocation.getCurrentPosition;navigator.geolocation.getCurrentPosition=(ok,bad)=>{navigator.geolocation.getCurrentPosition=original;bad({code:1});};});
   await page.locator('#use-birth-gps').click();
   await page.waitForFunction(()=>document.querySelector('#location-status').textContent.includes('declined'));
   assert.equal(await page.locator('#give-birth').isDisabled(),true);
   await page.locator('#use-birth-gps').click();
   await page.waitForFunction(()=>document.querySelector('#location-status').textContent.includes('Bratislava'));
   await page.locator('.portrait-option input').first().check();
   await page.locator('#stone-theme').selectOption('heart');
   assert.equal(await page.locator('#give-birth').isEnabled(),true);
   await page.waitForFunction(()=>[...document.querySelectorAll('.portrait-option img')].every(img=>img.complete&&img.naturalWidth>0));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:`/tmp/livingstones-birth-${width}.png`,fullPage:true});
   await page.locator('#give-birth').click();
   await page.waitForFunction(()=>document.querySelector('#form-status').textContent.includes('Someone just chose'));
   assert.equal(await page.locator('#give-birth').isDisabled(),true);
   assert.equal(await page.locator('#stone-name').inputValue(),'Pebble <hello>');
   assert.match(await page.locator('#pool-status').textContent(),/39/);
   await page.locator('.portrait-option input').first().check();await page.locator('#give-birth').click();
   await page.waitForFunction(()=>document.querySelector('#form-status').textContent.includes('couldn’t confirm'));
   assert.equal(birthWrites,1);
   await page.locator('#give-birth').click();
   await page.waitForURL('**/?stone=SNEW123&source=qr');await page.locator('#stone-dialog[open]').waitFor();
   assert.equal(birthWrites,1);assert.match(await page.locator('#detail-title').innerText(),/Pebble <hello>/);
   assert.equal(await page.locator('#detail-title hello').count(),0);
   assert.match(await page.locator('.detail-story').innerText(),/Painter <friend>/);
   assert.equal(await page.locator('.story-entry').count(),1);
   await page.goto('http://127.0.0.1:8137/?stone=SNEW123&source=qr');await page.locator('#stone-dialog[open]').waitFor();
   assert.ok(!page.url().includes('/initialize/'));
   await page.goto('http://127.0.0.1:8137/initialize/?stone=SNEW123');await page.waitForURL('**/?stone=SNEW123&source=qr');await page.locator('#stone-dialog[open]').waitFor();
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('Passed: create-label retries, pending QR routing, 10 portraits, mobile/desktop layouts, GPS denial, portrait conflict, lost birth response, escaped names and repeat QR story routing.');
 }finally{await browser.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
