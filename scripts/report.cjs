const fs=require('node:fs');
const path=require('node:path');
const {validate}=require('./source.cjs');
function inspect(root) {
  const files=[];
  function walk(dir) {
    for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
      const p=path.join(dir,e.name);
      if(e.isSymbolicLink() || (!e.isDirectory() && !e.isFile())) throw new Error('Unsafe report entry');
      if(e.isDirectory()) walk(p); else files.push(path.relative(root,p));
    }
  }
  walk(root);
  for(const required of ['html/index.html','summary.txt']) {
    if(!files.includes(required) || !fs.statSync(path.join(root,required)).size) throw new Error('Missing coverage content');
  }
  for(const file of files.filter(p=>p.endsWith('.html'))) {
    const html=fs.readFileSync(path.join(root,file),'utf8');
    for(const [,link] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (/^https:\/\//.test(link) || link.startsWith('#')) continue;
      const decoded=decodeURIComponent(link.split(/[?#]/)[0]);
      if(!decoded) continue;
      if(/^[a-z]+:|^\/|\\/i.test(decoded)) throw new Error('Unsafe report URL');
      const target=path.resolve(root,path.dirname(file),decoded), rel=path.relative(path.resolve(root),target);
      if(rel==='..' || rel.startsWith('../') || path.isAbsolute(rel)) throw new Error('Escaping report URL');
      if(!fs.statSync(target).isFile()) throw new Error('Missing report link');
    }
  }
  return files;
}
function build(input,output,selection) {
  validate(selection); inspect(input);
  if(fs.existsSync(output)) throw new Error('Output already exists');
  fs.mkdirSync(output,{recursive:true});
  fs.cpSync(path.join(input,'html'),path.join(output,'html'),{recursive:true});
  fs.copyFileSync(path.join(input,'summary.txt'),path.join(output,'summary.txt'));
  fs.writeFileSync(path.join(output,'provenance.json'),JSON.stringify(selection,null,2)+'\n');
  fs.writeFileSync(path.join(output,'index.html'),`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Panackelty native VM coverage</title><style>body{font:18px/1.6 system-ui;max-width:64rem;margin:3rem auto;padding:0 1.5rem;color:#222}a{color:#0755a3}code{overflow-wrap:anywhere}</style></head>
<body><main><p><a href="https://panackelty.com/">Panackelty</a></p><h1>Native VM test coverage</h1>
<p>LLVM line and branch coverage of the native C VM. This report does not measure the self-hosted compiler or the whole language.</p>
<p><a href="html/index.html">Browse source coverage</a> · <a href="summary.txt">Coverage summary</a></p>
<p>Report archived: <time>${selection.archived_at}</time></p>
<p>Source: <a href="https://github.com/sproates/panackelty/commit/${selection.coverage_sha}"><code>${selection.coverage_sha}</code></a></p>
<p><a href="https://github.com/sproates/panackelty/actions/runs/${selection.check_run}">Successful validation run</a> · <a href="provenance.json">Report provenance</a></p>
<p>Published independently of the main website. This is the latest successfully published report; check its timestamp and source when assessing freshness.</p></main></body></html>\n`);
  inspect(output);
}
async function verify(root,base) {
  const files=inspect(root);
  for (const file of files) {
    const response=await fetch(new URL(file,base),{signal:AbortSignal.timeout(15000),cache:'no-store'});
    if(!response.ok || !Buffer.from(await response.arrayBuffer()).equals(fs.readFileSync(path.join(root,file)))) throw new Error(`Published mismatch: ${file}`);
  }
}
module.exports={inspect,build,verify};
if(require.main===module) {
  const [mode,a,b,c]=process.argv.slice(2);
  Promise.resolve().then(()=>{
    if(mode==='build') return build(a,b,JSON.parse(fs.readFileSync(c,'utf8')));
    if(mode==='verify') return verify(a,b);
    throw new Error('Expected build or verify');
  }).catch(e=>{console.error(e.message);process.exitCode=1;});
}
