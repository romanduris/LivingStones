// Generate a high-entropy owner password. Only its hash reaches Cloudflare.
const {randomBytes,createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const output=process.argv[2]||path.join(os.tmpdir(),'livingstones-management-access-'+Date.now()+'.txt');
const password=randomBytes(32).toString('base64url');
const hash=createHash('sha256').update(password).digest('hex');
fs.writeFileSync(output,'Living Stones management\nhttps://livingstones.rodulab.com/management/\n\nPassword: '+password+'\n\nThis password is private. The API stores only its hash.\nSessions expire after four hours; Sign out revokes the current session.\n',{mode:0o600,flag:'wx'});
try {
 execFileSync('node',['node_modules/wrangler/bin/wrangler.js','secret','put','ADMIN_PASSWORD_HASH','--config','wrangler.jsonc'],{input:hash+'\n',stdio:['pipe','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 execFileSync('node',['node_modules/wrangler/bin/wrangler.js','d1','execute','livingstones-db','--remote','--config','wrangler.jsonc','--command','DELETE FROM admin_sessions'],{stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 console.log('Management password installed. Previous sessions revoked. Private access file: '+output);
} catch {
 console.error('Password setup was not fully confirmed. The private access file is '+output+'. Check the Cloudflare deployment before using it.');
 process.exitCode=1;
}
