const {chromium}=require('playwright'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs');
const server=spawn('python3',['-u','-m','http.server','8154']);process.on('exit',()=>server.kill());
(async()=>{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error('Server exited '+code)));});
 const browser=await chromium.launch();try{
  for(const width of [320,390,1100]){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:8154/guide/?lang=sk');await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.locator('.steps > li').count(),5);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Guide fits width '+width);
   assert.equal(await page.locator('img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0)),true);
   const pixels=await page.locator('figure img').evaluate(img=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,512,512);ctx.drawImage(img,0,0,512,512);return Array.from(ctx.getImageData(0,0,512,512).data);});
   assert.equal(require('jsqr')(new Uint8ClampedArray(pixels),512,512).data,'https://romanduris.github.io/LivingStones/');
   await page.evaluate(()=>{window.printCalls=0;window.print=()=>{window.printCalls++;};});await page.locator('#print-guide').click();await page.waitForFunction(()=>window.printCalls===1);
   for(const language of ['sk','en','hu','de']){
   await page.emulateMedia({media:'screen'});await page.locator('#guide-language').selectOption(language);
   assert.equal(await page.locator('html').getAttribute('lang'),language);
   assert.equal(new URL(page.url()).searchParams.get('lang'),language);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Language '+language+' fits '+width);
   await page.reload();await page.evaluate(()=>document.fonts.ready);assert.equal(await page.locator('#guide-language').inputValue(),language);
   await page.emulateMedia({media:'print'});assert.equal(await page.locator('.toolbar').isVisible(),false);
   const pdf=await page.pdf({preferCSSPageSize:true,printBackground:true,path:'/tmp/livingstones-guide-'+width+'-'+language+'.pdf'});
   assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,1,'Guide prints on one A4 at '+width);
   const paper=await page.pdf({preferCSSPageSize:true,printBackground:false});assert.equal((paper.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,1,'One page without background printing');
   if(width===1100){await page.setViewportSize({width:794,height:1123});await page.screenshot({path:'/tmp/livingstones-guide-print.png',fullPage:true});}
   }
   assert.deepEqual(errors,[]);await page.close();
  }
  const offline=await browser.newPage({javaScriptEnabled:false});await offline.goto('http://127.0.0.1:8154/guide/');assert.equal(await offline.locator('.steps > li').count(),5);await offline.close();
  const html=fs.readFileSync('management/index.html','utf8');assert.match(html,/href="\.\.\/guide\/"[^>]*>Printable guide/);
  console.log('Passed: five steps, mobile layouts, loaded visuals, scannable website QR, print button, SK/EN/HU/DE switching and shared URLs, single A4 PDFs with/without backgrounds at three widths, no-JS content and management link.');
 }finally{await browser.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
