const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const fixture=vm.createContext({});vm.runInContext(fs.readFileSync('fixtures/demo-data.js','utf8')+';globalThis.stones=DEMO_STONES',fixture);
const server=spawn('python3',['-u','-m','http.server','8137']);process.on('exit',()=>server.kill());
(async()=>{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error('Test server exited: '+code)))});
 const browser=await chromium.launch();
 try{
  for(const width of [375,1440]){
   const context=await browser.newContext({viewport:{width,height:900}});
   const stones=JSON.parse(JSON.stringify(fixture.stones));
   stones.forEach((s,index)=>{s.views=index+4;s.creator=s.finds[0].nickname;s.finds.forEach((f,i)=>f.id='find-'+s.id+'-'+i);s.comments=s.finds.map((f,i)=>({id:'comment-'+s.id+'-'+i,findId:f.id,date:f.date,nickname:f.nickname,message:f.message}));});
   const token='a'.repeat(64);let valid=true;
   await context.route('http://127.0.0.1:8787/api/admin/**',async route=>{
    const req=route.request(),parts=new URL(req.url()).pathname.split('/'),method=req.method();let result={stones},status=200;
    if(parts[3]==='login'){
     if(req.postDataJSON().password==='test-only-password'){valid=true;result={token,expiresAt:Math.floor(Date.now()/1000)+14400};}else{status=401;result={error:'That password is not correct.'};}
    }else if(!valid||req.headers().authorization!=='Bearer '+token){status=401;result={error:'Please sign in to management.'};}
    else if(parts[3]==='logout'){valid=false;result={ok:true};}
    else if(parts[3]==='stats'){
     const period=new URL(req.url()).searchParams.get('period')||'30',today=new Date().toISOString().slice(0,10);
     result={period,since:today,timezone:'UTC',range:{from:period==='all'?today:new Date(Date.parse(today)-(Number(period)-1)*86400000).toISOString().slice(0,10),to:today},targets:[{key:'home',name:'Homepage',kind:'home',totalViews:10,beforeRange:0},...stones.map(s=>({key:'stone:'+s.id,name:s.name,kind:'stone',totalViews:s.views,beforeRange:0}))],days:[{day:today,target:'home',views:10},...stones.map(s=>({day:today,target:'stone:'+s.id,views:s.views}))]};
    }else if(parts[4]){
     const s=stones.find(s=>s.id===parts[4]);
     if(parts[5]==='label-code'){
      if(req.postDataJSON().code==='PRIVATE9876')result={code:'PRIVATE9876'};else{status=403;result={error:'That Find Code does not match this stone.'};}
      return route.fulfill({status,contentType:'application/json',body:JSON.stringify(result)});
     }
     if(method==='PATCH'&&parts[5]){
      const body=req.postDataJSON(),item=s[parts[5]].find(r=>r.id===parts[6]);Object.assign(item,body);
      if(parts[5]==='comments')Object.assign(s.finds.find(f=>f.id===item.findId),{nickname:item.nickname,message:item.message});
      result={stone:s};
     }else if(method==='PATCH'){Object.assign(s,req.postDataJSON());result={stone:s};}
     else if(method==='DELETE'&&parts[5]){s[parts[5]]=s[parts[5]].filter(r=>r.id!==parts[6]);result={stone:s};}
     else if(method==='DELETE'){stones.splice(stones.indexOf(s),1);result={ok:true};}
     else result={stone:s};
    }
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(result)});
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:8137/management/');
   assert.equal(await page.locator('#login').isVisible(),true);assert.equal(await page.locator('.admin-stone-card').count(),0);
   await page.locator('#password').fill('wrong');await page.locator('#login-form button').click();await page.locator('#notice.error').waitFor();assert.equal(await page.locator('#login').isVisible(),true);
   await page.locator('#password').fill('test-only-password');await page.locator('#login-form button').click();await page.locator('.admin-stone-card').first().waitFor();assert.equal(await page.locator('.admin-stone-card').count(),5);
   assert.match(await page.locator('#summary').innerText(),/30\s+Story views/);
   await page.locator('#search').fill('Sunny');assert.equal(await page.locator('.admin-stone-card').count(),1);await page.locator('#search').fill('');
   await page.locator('#type-filter').selectOption('real');assert.equal(await page.locator('.admin-stone-card').count(),0);await page.locator('#type-filter').selectOption('all');
   await page.locator('#sort').selectOption('views');assert.match(await page.locator('.admin-stone-card').first().innerText(),/Ocean Echo/);
   await page.locator('button[data-stone="A1"]').click();await page.locator('#stone-form').waitFor();
   assert.equal(await page.locator('[name=story]').count(),0);
   assert.equal(await page.locator('.stone-qr .qr-code-value').textContent(),'8451');
   assert.ok(await page.locator('.qr-code-value').evaluate(el=>Number(el.getAttribute('font-size'))>=39));
   assert.equal(await page.locator('.admin-logo').evaluate(el=>el.complete&&el.naturalWidth>0),true);
   assert.equal(await page.locator('.stone-qr').getAttribute('data-error-correction'),'H');
   const svgEvent=page.waitForEvent('download');await page.locator('[data-download-qr=svg]').click();const svgDownload=await svgEvent;assert.match(fs.readFileSync(await svgDownload.path(),'utf8'),/fill="black">8451<\/text>/);
   const previewBytes=await page.locator('.stone-qr').screenshot({path:`/tmp/livingstones-qr-preview-${width}.png`});
   const downloadPromise=page.waitForEvent('download');await page.locator('[data-download-qr=png]').click();
   const download=await downloadPromise;const bytes=fs.readFileSync(await download.path());
   const decoder=await context.newPage();await decoder.route('http://127.0.0.1:8137/qr-decoder',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html></html>'}));await decoder.goto('http://127.0.0.1:8137/qr-decoder');
   const pixels=await decoder.evaluate(async base64=>{const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width/6;canvas.height=image.height/6;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(image,0,0,canvas.width,canvas.height);return {width:canvas.width,height:canvas.height,data:Array.from(c.getImageData(0,0,canvas.width,canvas.height).data)};},bytes.toString('base64'));
   const previewPixels=await decoder.evaluate(async base64=>{const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const c=canvas.getContext('2d');c.drawImage(image,0,0);return {width:canvas.width,height:canvas.height,data:Array.from(c.getImageData(0,0,canvas.width,canvas.height).data)};},previewBytes.toString('base64'));
   assert.equal(require('jsqr')(new Uint8ClampedArray(previewPixels.data),previewPixels.width,previewPixels.height).data,'https://livingstones.rodulab.com/?stone=A1');
   const decoded=require('jsqr')(new Uint8ClampedArray(pixels.data),pixels.width,pixels.height);assert.equal(decoded.data,'https://livingstones.rodulab.com/?stone=A1');const svgPixels=await decoder.evaluate(async base64=>{const image=new Image();image.src='data:image/svg+xml;base64,'+base64;await image.decode();const canvas=document.createElement('canvas');const viewBox=new DOMParser().parseFromString(atob(base64),"image/svg+xml").documentElement.getAttribute("viewBox").split(" ").map(Number);canvas.width=viewBox[2]*2;canvas.height=viewBox[3]*2;const c=canvas.getContext('2d');c.drawImage(image,0,0,canvas.width,canvas.height);return {width:canvas.width,height:canvas.height,data:Array.from(c.getImageData(0,0,canvas.width,canvas.height).data)};},fs.readFileSync(await svgDownload.path()).toString('base64'));
   assert.equal(require('jsqr')(new Uint8ClampedArray(svgPixels.data),svgPixels.width,svgPixels.height).data,'https://livingstones.rodulab.com/?stone=A1');
   await decoder.close();
   const realLabel=stones.find(s=>s.id==='A1');realLabel.demo=false;delete realLabel.code;
   await page.reload();await page.locator('#qr-code-form').waitFor();
   await page.locator('#qr-code-form input').fill('WRONG');await page.locator('#qr-code-form button').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent==='That Find Code does not match this stone.');assert.equal(await page.locator('.qr-code-value').count(),0);
   await page.locator('#qr-code-form input').fill('PRIVATE9876');await page.locator('#qr-code-form button').click();await page.locator('.stone-qr .qr-code-value').waitFor();assert.equal(await page.locator('.stone-qr .qr-code-value').textContent(),'PRIVATE9876');assert.equal(await page.evaluate(()=>Object.values(sessionStorage).join(' ').includes('PRIVATE9876')),false);
   realLabel.demo=true;realLabel.code='8451';await page.reload();await page.locator('#stone-form').waitFor();
   await page.locator('[data-section=stats]').click();await page.locator('#traffic-summary strong').first().waitFor();
   assert.equal(await page.locator('#editor').isVisible(),false);assert.equal(await page.locator('#traffic-summary strong').first().innerText(),'40');
   await page.locator('#stats-target').selectOption('home');assert.equal(await page.locator('#traffic-summary strong').first().innerText(),'10');
   await page.locator('#stats-target').selectOption('stone:A1');assert.equal(await page.locator('#traffic-summary strong').first().innerText(),'4');
   await page.locator('[data-period="7"]').click();await page.waitForFunction(()=>document.querySelector('[data-period="7"]').getAttribute('aria-pressed')==='true');
   assert.equal(await page.locator('#daily-chart [data-chart-label]').count(),7);
   await page.locator('#daily-chart [data-chart-label]').last().focus();assert.match(await page.locator('#daily-chart-detail').innerText(),/4 opens/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.locator('#admin-main').screenshot({path:`/tmp/livingstones-stats-${width}.png`});
   await page.reload();await page.locator('#traffic-summary strong').first().waitFor();assert.equal(await page.locator('#stats-target').inputValue(),'stone:A1');
   await page.locator('[data-section=management]').click();await page.locator('button[data-stone="A1"]').click();await page.locator('#stone-form').waitFor();
   await page.locator('#stone-form input[name="name"]').fill('Sunny Updated');await page.locator('#stone-form button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#editor h1').textContent==='Sunny Updated');
   await page.reload();await page.locator('#stone-form').waitFor();assert.equal(await page.locator('#editor h1').innerText(),'Sunny Updated');
   await page.locator('[data-tab="comments"]').click();await page.locator('[data-edit-comment]').first().click();
   await page.locator('#record-form input[name="nickname"]').fill('<img src=x onerror=alert(1)>');await page.locator('#record-form textarea').fill('<script>window.adminInjected=true</script> Test edit');
   await page.locator('#record-form button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#record-dialog').open);
   assert.match(await page.locator('#records').innerText(),/window.adminInjected/);assert.equal(await page.evaluate(()=>window.adminInjected),undefined);assert.equal(await page.locator('#records script,#records img').count(),0);
   await page.locator('[data-tab="finds"]').click();const originalDate=stones.find(s=>s.id==='A1').finds.at(-1).date;await page.locator('[data-edit-find]').first().click();await page.locator('#record-form input[name="city"]').fill('Edited city');await page.locator('#record-form button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#record-dialog').open);assert.match(await page.locator('#records').innerText(),/Edited city/);assert.equal(stones.find(s=>s.id==='A1').finds.at(-1).date,originalDate);
   await page.locator('[data-tab="comments"]').click();const before=await page.locator('.admin-record').count();
   page.once('dialog',d=>d.dismiss());await page.locator('[data-delete-comment]').first().click();assert.equal(await page.locator('.admin-record').count(),before);
   page.once('dialog',d=>d.accept());await page.locator('[data-delete-comment]').first().click();await page.waitForFunction(n=>document.querySelectorAll('.admin-record').length===n,before-1);
   await page.locator('[data-tab="finds"]').click();assert.equal(await page.locator('.admin-record').count(),5);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Management fits at ${width}`);
   await page.locator('#admin-main').screenshot({path:`/tmp/livingstones-management-${width}.png`});
   page.once('dialog',d=>d.accept());await page.locator('[data-action="delete-stone"]').click();await page.locator('#dashboard').waitFor();assert.equal(await page.locator('.admin-stone-card').count(),4);
   await page.locator('#logout').click();await page.locator('#login').waitFor();assert.equal(await page.evaluate(()=>sessionStorage.getItem('livingstones-management-session')),null);
   await page.reload();assert.equal(await page.locator('#login').isVisible(),true);assert.deepEqual(errors,[]);
   await context.close();
  }
  console.log('Passed: management sign-in, persistent sessions, filters, view totals, stone/find/comment editing, escaped user text, deletion confirmation, sign-out and responsive layouts.');
 }finally{await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
