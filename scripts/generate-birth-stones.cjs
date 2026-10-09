// Extend the existing editable SVG illustrations; regenerate with node scripts/generate-birth-stones.cjs.
const fs = require('node:fs');
const themes = ['sun','moon','leaf','heart','wave'];
const palettes = [
  ['Honey','#f3df9c','#bea66d','#786448','#ffcf64'],
  ['Lavender','#e2d8ff','#aca0cc','#65587d','#b49aff'],
  ['Mint','#d7f0de','#98bbaa','#506f68','#62d7cb'],
  ['Rose','#ffded9','#ce9c9a','#845e6a','#ff8c92'],
  ['Ocean','#d0e9ff','#92afc8','#526b86','#76c9ee'],
  ['Peach','#ffe6c6','#cdb090','#886b55','#ffb879'],
  ['Silver','#e5e8ed','#b1b7c3','#626c80','#b0bac5'],
  ['Lilac','#eddbef','#bfa2c2','#795e85','#d29cdf'],
];
const catalog=[];
for (let p=0;p<palettes.length;p++) for(let t=0;t<themes.length;t++) {
  const [label,light,mid,dark,color]=palettes[p];
  let svg=fs.readFileSync(`docs/assets/stone-${t+1}.svg`,'utf8');
  const gradient=svg.match(/<radialGradient id="s"[\s\S]*?<\/radialGradient>/)[0];
  let n=0;svg=svg.replace(gradient,gradient.replace(/stop-color="[^"]+"/g,()=>`stop-color="${[light,mid,dark,'#343e3d'][n++]}"`));
  svg=svg.replace(/seed="\d+"/,`seed="${p*5+t+21}"`);
  // Vary the painted motif and add small hand-painted speckles.
  const paint='<g filter="url(#paint)">';
  const pos=svg.lastIndexOf(paint);
  svg=svg.slice(0,pos)+svg.slice(pos).replace(paint,`${paint}<g transform="rotate(${(p-3)*4} 170 150)">`).replace('</svg>','</g></svg>');
  const stars=Array.from({length:3},(_,j)=>`<circle cx="${110+j*57}" cy="${85+((p+j)%3)*10}" r="${2+p%3}" fill="${light}" opacity=".7"/>`).join('');
  svg=svg.replace('</svg>',stars+'</svg>');
  const id=`birth-${String(p*5+t+1).padStart(2,'0')}`,image=`birth-stones/${id}.svg`;
  fs.writeFileSync('docs/assets/'+image,svg.trimEnd()+'\n');
  catalog.push({id,image,label:`${label} ${themes[t][0].toUpperCase()+themes[t].slice(1)}`,theme:themes[t],color});
}
fs.writeFileSync('fixtures/birth-stones.json',JSON.stringify(catalog,null,2)+'\n');
const sql=catalog.map(a=>`INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('${a.id}','${a.image}','${a.label}','${a.theme}','${a.color}');`).join('\n');
const schema=`ALTER TABLE stones ADD COLUMN initialized INTEGER NOT NULL DEFAULT 1 CHECK(initialized IN (0,1));
ALTER TABLE stones ADD COLUMN creation_key TEXT;
CREATE UNIQUE INDEX stone_creation_key ON stones(creation_key);
CREATE TABLE stone_image_pool (
 id TEXT PRIMARY KEY, image TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
 theme TEXT NOT NULL, color TEXT NOT NULL,
 stone_id TEXT UNIQUE REFERENCES stones(id) ON DELETE SET NULL,
 claimed_at TEXT
);
CREATE TABLE stone_initializations (
 id TEXT PRIMARY KEY, stone_id TEXT NOT NULL UNIQUE REFERENCES stones(id) ON DELETE CASCADE,
 fingerprint TEXT NOT NULL, created_at TEXT NOT NULL
);
-- claimed_at remains set after a deletion: an adopted portrait is never reused.
`;
fs.writeFileSync('backend/migrations/0010_stone_initialization.sql',schema+sql+'\n');
console.log('Generated 40 SVG portraits and their inventory migration.');
