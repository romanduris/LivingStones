'use strict';
globalThis.StoneStats = (() => {
  const dayMs=86400000;
  const shortDate=d=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(d+'T00:00:00Z'));
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function series(data,selection='all') {
    const targets=data.targets.filter(t=>selection==='all'||(selection==='stories'?t.kind==='stone':t.key===selection));
    const keys=new Set(targets.map(t=>t.key)),kinds=new Map(targets.map(t=>[t.key,t.kind]));
    const totals=new Map();
    for(const entry of data.days)if(keys.has(entry.target)){
      const row=totals.get(entry.day)||{home:0,stories:0};
      row[kinds.get(entry.target)==='home'?'home':'stories']+=entry.views;totals.set(entry.day,row);
    }
    let cumulative=targets.reduce((n,t)=>n+t.beforeRange,0);
    const days=[];
    for(let time=Date.parse(data.range.from+'T00:00:00Z'),end=Date.parse(data.range.to+'T00:00:00Z');time<=end;time+=dayMs){
      const date=new Date(time).toISOString().slice(0,10),counts=totals.get(date)||{home:0,stories:0};
      cumulative+=counts.home+counts.stories;
      days.push({date,home:counts.home,stories:counts.stories,total:counts.home+counts.stories,cumulative});
    }
    return {days,qrTotal:targets.reduce((n,t)=>n+(t.totalQrViews||0),0),qrInRange:data.days.filter(row=>keys.has(row.target)).reduce((n,row)=>n+(row.qrViews||0),0),total:targets.reduce((n,t)=>n+t.totalViews,0),inRange:days.reduce((n,d)=>n+d.total,0),today:days.at(-1)?.total||0};
  }
  function buckets(days,maximum=45){
    const size=Math.max(1,Math.ceil(days.length/maximum)),result=[];
    for(let i=0;i<days.length;i+=size){const rows=days.slice(i,i+size),last=rows.at(-1);result.push({from:rows[0].date,to:last.date,home:rows.reduce((n,r)=>n+r.home,0),stories:rows.reduce((n,r)=>n+r.stories,0),total:rows.reduce((n,r)=>n+r.total,0),cumulative:last.cumulative});}
    return result;
  }
  function chart(days,type,chartWidth=1000){
    const points=buckets(days),W=chartWidth,H=280,left=58,right=18,top=20,bottom=45,width=W-left-right,height=H-top-bottom;
    const maximum=Math.max(2,Math.ceil(Math.max(0,...points.map(p=>type==='cumulative'?p.cumulative:p.total))/2)*2);
    const x=i=>left+width*(i+.5)/Math.max(1,points.length),y=v=>top+height*(1-v/maximum),base=y(0),bar=Math.min(28,width/Math.max(1,points.length)*.65);
    const grid=[0,.5,1].map(p=>`<line class="chart-grid" x1="${left}" x2="${W-right}" y1="${y(maximum*p)}" y2="${y(maximum*p)}"/><text class="chart-label" x="${left-10}" y="${y(maximum*p)+4}" text-anchor="end">${Math.round(maximum*p).toLocaleString('en-GB')}</text>`).join('');
    const labels=[...new Set(Array.from({length:Math.min(5,points.length)},(_,n)=>Math.round(n*(points.length-1)/Math.max(1,Math.min(5,points.length)-1))))].map(i=>`<text class="chart-label" x="${x(i)}" y="${H-12}" text-anchor="middle">${shortDate(points[i].to)}</text>`).join('');
    let shape='';
    if(type==='cumulative'&&points.length){const coords=points.map((p,i)=>`${x(i)},${y(p.cumulative)}`).join(' ');shape=`<defs><linearGradient id="cumulative-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#b49aff" stop-opacity=".35"/><stop offset="100%" stop-color="#b49aff" stop-opacity=".02"/></linearGradient></defs><polygon points="${x(0)},${base} ${coords} ${x(points.length-1)},${base}" fill="url(#cumulative-fill)"/><polyline class="chart-line" points="${coords}"/>`;}
    const marks=points.map((p,i)=>{
      const range=p.from===p.to?shortDate(p.to):`${shortDate(p.from)} – ${shortDate(p.to)}`;
      const label=type==='cumulative'?`${range}: ${p.cumulative} total opens`:`${range}: ${p.total} opens (${p.home} homepage, ${p.stories} stone stories)`;
      const point=type==='cumulative'?`<circle class="chart-point" cx="${x(i)}" cy="${y(p.cumulative)}" r="4"/>`:`<rect class="chart-home" x="${x(i)-bar/2}" y="${y(p.home)}" width="${bar}" height="${base-y(p.home)}" rx="2"/><rect class="chart-stories" x="${x(i)-bar/2}" y="${y(p.total)}" width="${bar}" height="${y(p.home)-y(p.total)}" rx="2"/>`;
      return `<g tabindex="0" role="listitem" data-chart-label="${escape(label)}" aria-label="${escape(label)}"><title>${escape(label)}</title>${point}<rect class="chart-hit" x="${x(i)-width/points.length/2}" y="${top}" width="${width/points.length}" height="${height}"/></g>`;
    }).join('');
    return `<svg class="traffic-chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="${type==='cumulative'?'Cumulative opens':'Opens over time'}">${grid}${shape}${marks}${labels}</svg>`;
  }
  return {series,buckets,chart};
})();
