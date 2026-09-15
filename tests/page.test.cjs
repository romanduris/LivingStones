const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('docs/app.js', 'utf8');
function setup(fetchImpl = async () => ({ok:true,json:async()=>({success:true,ip:'203.0.113.7',city:'Test City'})}), overrides = {}) {
  const elements = new Map();
  let calls = 0;
  const element = () => ({children:[], disabled:false, textContent:'', append(...items){this.children.push(...items)}, replaceChildren(...items){this.children=items}, addEventListener(name,fn){this[name]=fn}});
  const document = {createElement:element,querySelector(id){if(!elements.has(id)) elements.set(id,element());return elements.get(id)},referrer:'',visibilityState:'visible'};
  const context = {document,navigator:{userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36',language:'sk',languages:['sk'],onLine:true},screen:{width:1920,height:1080,availWidth:1920,availHeight:1040,colorDepth:24},innerWidth:1200,innerHeight:800,devicePixelRatio:1,isSecureContext:true,location:{origin:'https://example.com',pathname:'/'},matchMedia:()=>({matches:false}),Intl,Date,setTimeout,clearTimeout,AbortController,fetch:async(...args)=>{calls++;return fetchImpl(...args)}};
  Object.assign(context, overrides);
  vm.createContext(context);vm.runInContext(source,context);
  return {context,elements,calls:()=>calls};
}
const settle = () => new Promise(resolve=>setImmediate(resolve));
const summary = page => Object.fromEntries(['User ID','Device','Poloha','Pásmo','OS version'].map((key,i)=>[key,page.elements.get('#device-summary').children[0].children[i].textContent]));
const values = list => list.children.map(row=>row.children.map(cell=>cell.textContent));
test('loads IP without clicking and renders local cards without optional browser APIs', async()=>{
  const page=setup();await settle();
  assert.equal(page.calls(),1);
  assert.equal(page.elements.get('#cards').children.length,10);
  assert.ok(values(page.elements.get('#ip-result')).some(([key,value])=>key==='Verejná IP'&&value==='203.0.113.7'));
  assert.equal(page.elements.get('#ip').disabled,false);
  assert.match(page.elements.get('#cards').children[7].children[1].children[0].children[1].textContent,/neposkytuje/);
});
test('IP network and service errors leave retry available and local data visible',async()=>{
  for(const fetchImpl of [async()=>{throw Error('offline')},async()=>({ok:false}),async()=>({ok:true,json:async()=>({error:true})})]){
    const page=setup(fetchImpl);await settle();
    assert.match(values(page.elements.get('#ip-result'))[0][1],/nedostupné/);
    assert.equal(page.elements.get('#ip').disabled,false);
    assert.equal(page.elements.get('#cards').children.length,10);
    await page.elements.get('#ip').click();assert.equal(page.calls(),4);
  }
});
test('device estimates cover desktop, mobile, tablet and unknown',()=>{
  const {context}=setup();
  const identify=n=>context.identifyDevice(n);
  assert.equal(identify({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1'}).type,'Mobil');
  assert.equal(identify({userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Safari/605.1',maxTouchPoints:5}).os,'iPadOS');
  assert.equal(identify({userAgent:'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Safari/537.36'}).type,'Tablet');
  assert.equal(identify(context.navigator).os,'Windows 10 / 11');
  assert.equal(identify({userAgent:'Mozilla/5.0 Chrome/130.0 Safari/537.36 Edg/130.1'}).browser,'Edge 130.1');
  assert.equal(identify({userAgent:'unknown'}).type,'Nedostupné');
});
test('refresh does not duplicate cards or overlap IP requests',async()=>{
  let release;
  const page=setup(()=>new Promise(resolve=>{release=resolve}));
  page.elements.get('#refresh').click();assert.equal(page.calls(),1);
  assert.equal(page.elements.get('#cards').children.length,10);
  release({ok:true,json:async()=>({success:true,ip:'203.0.113.7',city:'Test City'})});await settle();
  assert.equal(page.elements.get('#ip').disabled,false);
});
test('location denial restores button and displays understandable error',async()=>{
  const page=setup();await settle();
  page.context.navigator.geolocation={getCurrentPosition(success,error){error({code:1})}};
  const button=page.elements.get('#location');button.click({currentTarget:button});
  assert.equal(button.disabled,false);
  assert.match(values(page.elements.get('#location-result'))[0][1],/zamietnuté/);
});
test('root and docs entry points match except asset paths and preserve introduction',()=>{
  const docs=fs.readFileSync('docs/index.html','utf8');
  assert.equal(fs.readFileSync('index.html','utf8'),docs.replace('href="style.css?v=5"','href="docs/style.css?v=5"').replace('src="app.js?v=5"','src="docs/app.js?v=5"'));
  assert.ok(docs.includes('Pozri sa, aké informácie sprístupňuje tvoj prehliadač práve teraz.'));
});
test('falls back after network, HTTP, JSON, service and incomplete responses', async()=>{
  const failures = [
    async()=>{throw Error('offline')},
    async()=>({ok:false,status:429}),
    async()=>({ok:true,json:async()=>{throw Error('invalid JSON')}}),
    ...[null, {success:false}, {success:true,ip:'203.0.113.7'}, {success:true,city:'Test'}]
      .map(data=>async()=>({ok:true,json:async()=>data}))
  ];
  for (const fail of failures) {
    const urls=[];
    const page=setup(async(url,options)=>{
      urls.push(url);
      assert.equal(options.credentials,'omit');
      assert.equal(options.referrerPolicy,'no-referrer');
      if(urls.length===1) return fail();
      assert.equal(options.signal.aborted,false);
      return {ok:true,json:async()=>({ip:'203.0.113.8',country_name:'Slovakia',city:'Bratislava'})};
    });
    await settle();
    assert.deepEqual(urls,['https://ipwho.is/','https://ipapi.co/json/']);
    const result=Object.fromEntries(values(page.elements.get('#ip-result')));
    assert.equal(result['Zdroj údajov'],'ipapi.co');
    assert.equal(result['Mesto (odhad)'],'Bratislava');
    assert.equal(page.elements.get('#ip').disabled,false);
  }
});
test('maps primary provider fields and preserves zero coordinates',async()=>{
  const page=setup(async()=>({ok:true,json:async()=>({success:true,ip:'203.0.113.7',type:'IPv4',country:'Test',city:'Test City',connection:{asn:64500,org:'Test ISP'},timezone:{id:'Etc/UTC'},latitude:0,longitude:0})}));
  await settle();
  const result=Object.fromEntries(values(page.elements.get('#ip-result')));
  assert.equal(page.calls(),1);
  assert.equal(result['Zdroj údajov'],'ipwho.is');
  assert.equal(result['Autonómny systém'],'AS64500');
  assert.equal(result['Časové pásmo podľa IP'],'Etc/UTC');
  assert.equal(result['Zemepisná šírka (odhad)'],'0');
  assert.equal(result['PSČ (odhad)'],'Nedostupné');
});
test('summary retains browser ID across loads and updates location',async()=>{
  const stored=new Map();
  const id='12345678-1234-4567-89ab-123456789abc';
  let generated=0;
  const overrides={localStorage:{getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)},crypto:{randomUUID:()=>{generated++;return id}}};
  const first=setup(undefined,overrides);
  assert.equal(summary(first)['Poloha'],'Načítavam…');
  await settle();
  const result=summary(first);
  assert.equal(result['User ID'],id);
  assert.equal(result['Device'],'Desktop');
  assert.equal(result['Poloha'],'Test City');
  const second=setup(undefined,overrides);await settle();
  assert.equal(summary(second)['User ID'],id);
  assert.equal(generated,1);
});
test('summary handles blocked storage, failed location and mobile platforms',async()=>{
  for(const [ua,platform,os] of [
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1','Apple','iOS 18.0'],
    ['Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36','Android','Android 14']
  ]){
    const page=setup(async()=>{throw Error('offline')},{navigator:{userAgent:ua},localStorage:{getItem(){throw Error('blocked')}}});
    await settle();
    const result=summary(page);
    assert.equal(result['User ID'],'Nedostupné');
    assert.equal(result['Poloha'],'Nedostupné');
    assert.equal(result['Device'],'Mobile');
    assert.equal(result['OS version'],os);
    assert.equal(page.elements.get('#ip').disabled,false);
  }
});
test('IP map updates to device location only after click and survives late IP and refresh',async()=>{
  let release, locate, requests=0;
  const page=setup(()=>new Promise(resolve=>{release=resolve}));
  page.context.navigator.geolocation={getCurrentPosition(success,error,options){requests++;locate=success;assert.equal(options.enableHighAccuracy,true)}};
  assert.equal(requests,0);
  const button=page.elements.get('#location');
  button.click({currentTarget:button});button.click({currentTarget:button});
  assert.equal(requests,1);
  locate({coords:{latitude:48.1486,longitude:17.1077,accuracy:25},timestamp:Date.now()});
  const src=page.elements.get('#location-map').src;
  assert.match(src,/marker=48.1486,17.1077/);
  assert.match(summary(page).Poloha,/25 m/);
  release({ok:true,json:async()=>({success:true,ip:'203.0.113.7',city:'Other City',latitude:50,longitude:20})});await settle();
  assert.equal(page.elements.get('#location-map').src,src);
  assert.match(summary(page).Poloha,/48.14860/);
  page.elements.get('#refresh').click();
  release({ok:false});await settle();
  release({ok:false});await settle();
  assert.equal(page.elements.get('#location-map').src,src);
  assert.match(summary(page).Poloha,/25 m/);
});
test('IP map validates coordinates and geolocation failures preserve existing map',async()=>{
  const page=setup(async()=>({ok:true,json:async()=>({success:true,ip:'203.0.113.7',city:'Test City',latitude:0,longitude:0})}));await settle();
  const frame=page.elements.get('#location-map');
  assert.match(frame.src,/marker=0,0/);assert.equal(frame.hidden,false);
  const original=frame.src;
  for(const code of [1,2,3]){
    page.context.navigator.geolocation={getCurrentPosition(success,error){error({code})}};
    const button=page.elements.get('#location');button.click({currentTarget:button});
    assert.equal(button.disabled,false);assert.equal(frame.src,original);
  }
  page.context.showMap(91,17);assert.equal(frame.hidden,true);
  page.context.showMap(null,null);assert.equal(frame.hidden,true);
});
