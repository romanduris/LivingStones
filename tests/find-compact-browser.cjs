const {chromium,devices}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{spawn}=require('node:child_process');
const fixture=vm.createContext({});vm.runInContext(fs.readFileSync('fixtures/demo-data.js','utf8')+';globalThis.stones=DEMO_STONES',fixture);
const server=spawn('python3',['-u','-m','http.server','8149']);process.on('exit',()=>server.kill());
(async()=>{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error('Server exited '+code)));});
 const browser=await chromium.launch();try{
  for(const [width,height] of [[320,640],[375,740],[390,844]]){
   const context=await browser.newContext({...devices['iPhone 13'],locale:'sk-SK',viewport:{width,height},permissions:['geolocation'],geolocation:{latitude:48.148,longitude:17.107,accuracy:9}});
   const stones=JSON.parse(JSON.stringify(fixture.stones));stones[0].demo=false;delete stones[0].code;
   await context.route('http://127.0.0.1:8787/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(route.request().method()==='GET'?{stones}:{ok:true,views:0})}));
   await context.route('https://photon.komoot.io/reverse**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({features:[{properties:{city:'Bratislava',country:'Slovakia',street:'Panská cesta',housenumber:'25',district:'Petržalka'}}]})}));
   await context.route('https://photon.komoot.io/api/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({features:[{geometry:{type:'Point',coordinates:[17.1,48.1]},properties:{name:'Bratislava',country:'Slovakia'}}]})}));
   await context.route('https://tile.openstreetmap.org/**',route=>route.abort());
   const page=await context.newPage();await page.goto('http://127.0.0.1:8149/?stone=A1&source=qr');await page.locator('#start-find').click();await page.evaluate(()=>document.fonts.ready);
   const fit=async label=>{
    await page.waitForTimeout(350);
    const dimensions=await page.evaluate(()=>{const panel=document.querySelector('#find-container .find-panel').getBoundingClientRect(),topbar=document.querySelector('.detail-topbar').getBoundingClientRect(),dialog=document.querySelector('#stone-dialog').getBoundingClientRect();return {top:panel.top,bottom:panel.bottom,topbarBottom:topbar.bottom,dialogBottom:dialog.bottom};});
    assert.ok(dimensions.top>=dimensions.topbarBottom-1&&dimensions.bottom<=dimensions.dialogBottom-8,`${label} fits ${width}×${height}: ${JSON.stringify(dimensions)}`);
   };
   assert.equal(await page.locator('#find-code').getAttribute('inputmode'),'numeric','Real stones do not expose their code but still show a numeric keyboard');
   assert.equal(await page.locator('#find-code').getAttribute('type'),null,'Text input keeps leading zeroes');
   await fit('Code');await page.locator('#find-code').fill('0123');await page.locator('#find-form button[type=submit]').click();await page.locator('#location-status.ready').waitFor();await fit('GPS location');
   await page.locator('#location-next').click();await fit('Nickname and message');assert.equal(await page.locator('#find-message').getAttribute('rows'),'2');
   await page.locator('#nickname').fill('Roman');await page.locator('#find-message').fill('Pekný kamienok');await page.locator('#flow-back').click();
   await page.locator('#choose-city').click();await page.locator('#manual-city').fill('Bra');await page.locator('.city-result').click();assert.equal(await page.locator('#manual-location').isVisible(),false);await fit('Selected city');
   await page.locator('#location-next').click();assert.equal(await page.locator('#nickname').inputValue(),'Roman');assert.equal(await page.locator('#find-message').inputValue(),'Pekný kamienok');await fit('Preserved draft');
   await context.close();
  }
  console.log('Passed: three find steps fit 320×640 / 375×740 / 390×844 phones, numeric keyboard for private real codes, compact GPS/manual location, collapsed city search and preserved drafts.');
 }finally{await browser.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
