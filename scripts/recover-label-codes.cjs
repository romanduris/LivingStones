// Restore existing four-digit labels by matching their verification hashes.
// Never change a code/hash, and never log a recovered code.
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
function recoverLabelCodes(rows){
  const wanted=new Map(rows.map(row=>[row.code_hash,null]));
  for(let value=0;value<10000;value++){
    const code=String(value).padStart(4,'0'),hash=createHash('sha256').update(code).digest('hex');
    if(wanted.has(hash))wanted.set(hash,code);
  }
  return rows.flatMap(row=>wanted.get(row.code_hash)?[{...row,code:wanted.get(row.code_hash)}]:[]);
}
module.exports={recoverLabelCodes};
if(require.main===module){
  const args=process.argv.slice(2);
  if(args.length!==1||args[0]!=='--remote')throw new Error('Usage: node scripts/recover-label-codes.cjs --remote');
  const cli=extra=>execFileSync('node',['node_modules/wrangler/bin/wrangler.js','d1','execute','livingstones-db','--config','wrangler.jsonc','--remote','--json',...extra],{encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  const rows=JSON.parse(cli(['--command','SELECT id,code_hash FROM stones WHERE is_demo=0 AND label_code IS NULL;']))[0].results;
  const recovered=recoverLabelCodes(rows);
  if(recovered.length){
    const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'livingstones-labels-'));
    fs.chmodSync(dir,0o700);
    try{
      const file=path.join(dir,'restore.sql');
      fs.writeFileSync(file,recovered.map(row=>`UPDATE stones SET label_code=${quote(row.code)} WHERE id=${quote(row.id)} AND code_hash=${quote(row.code_hash)} AND label_code IS NULL AND is_demo=0;`).join('\n'),{mode:0o600});
      cli(['--file',file]);
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
  }
  console.log(`Restored ${recovered.length} existing labels without changing their verification codes. ${rows.length-recovered.length} legacy labels require their original printed code.`);
}
