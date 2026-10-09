const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const context=vm.createContext({});vm.runInContext(fs.readFileSync('management/statistics.js','utf8'),context);
const stats=context.StoneStats;
const data={range:{from:'2026-10-04',to:'2026-10-06'},targets:[{key:'home',kind:'home',totalViews:8,beforeRange:2},{key:'stone:A1',kind:'stone',totalViews:12,beforeRange:7},{key:'stone:B2',kind:'stone',totalViews:4,beforeRange:4,deleted:true}],days:[{day:'2026-10-04',target:'home',views:6},{day:'2026-10-06',target:'stone:A1',views:5}]};
test('traffic fills empty days and carries earlier totals into cumulative series',()=>{
 const r=stats.series(data);assert.equal(r.total,24);assert.equal(r.inRange,11);assert.equal(r.today,5);assert.deepEqual(Array.from(r.days,d=>d.cumulative),[19,19,24]);assert.deepEqual(Array.from(r.days,d=>d.total),[6,0,5]);
});
test('homepage, stories and individual stone filters preserve their own totals',()=>{
 assert.equal(stats.series(data,'home').today,0);assert.equal(stats.series(data,'home').total,8);assert.equal(stats.series(data,'stories').total,16);assert.equal(stats.series(data,'stone:A1').days.at(-1).cumulative,12);assert.equal(stats.series(data,'stone:B2').total,4);
});
test('long chart periods retain counts and final cumulative total when grouped',()=>{
 const days=Array.from({length:365},(_,i)=>({date:new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10),home:1,stories:2,total:3,cumulative:20+(i+1)*3}));
 const bins=stats.buckets(days);assert.ok(bins.length<=45);assert.equal(bins.reduce((n,d)=>n+d.total,0),1095);assert.equal(bins.at(-1).cumulative,1115);assert.equal(bins[0].from,'2025-01-01');assert.match(stats.chart(days,'daily'),/tabindex="0"/);
});

test('QR opens are a subset of views and respect page and period filters',()=>{
 const qr={...data,targets:data.targets.map(t=>({...t,totalQrViews:t.kind==='stone'?3:0})),days:data.days.map(row=>({...row,qrViews:row.target==='stone:A1'?2:0}))};
 assert.equal(stats.series(qr).total,24);assert.equal(stats.series(qr).qrTotal,6);assert.equal(stats.series(qr).qrInRange,2);
 assert.equal(stats.series(qr,'home').qrTotal,0);assert.equal(stats.series(qr,'stone:B2').qrTotal,3);assert.equal(stats.series(qr,'stone:B2').qrInRange,0);
 assert.equal(stats.series(data).qrTotal,0);
});
