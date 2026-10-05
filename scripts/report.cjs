const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {validate}=require('./source.cjs');
function inspect(root) {
  if(!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) throw new Error('Unsafe report root');
  const files=[];let bytes=0;
  function walk(dir) {
    for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
      const p=path.join(dir,e.name);
      if(e.isSymbolicLink() || (!e.isDirectory() && !e.isFile())) throw new Error('Unsafe report entry');
      if(e.isDirectory()) walk(p); else {
        files.push(path.relative(root,p));bytes+=fs.statSync(p).size;
        if(files.length>10000 || bytes>256*1024*1024) throw new Error('Report bounds exceeded');
      }
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
function sourceSummary(input,selection) {
  validate(selection);
  if(selection.schema!==2) throw new Error('Expected next source selection');
  inspect(input);
  const file=path.join(input,'summary.json');
  if(fs.lstatSync(file).size>16*1024*1024) throw new Error('Oversized source summary');
  const report=JSON.parse(fs.readFileSync(file,'utf8'));
  const hash=s=>typeof s==='string' && /^[a-f0-9]{64}$/.test(s);
  if(report.schema!==1 || report.repository!==selection.repository || report.branch!=='next' || report.clean!==true || report.commit!==selection.coverage_sha ||
      !hash(report.compiler) || !hash(report.vm) || !hash(report.manifestHash) || !Number.isFinite(Date.parse(report.generatedAt)) ||
      Date.parse(report.generatedAt)>Date.parse(selection.archived_at)+300000) throw new Error('Source summary identity mismatch');
  const states=['covered','zero','unavailable'];
  if(!Array.isArray(report.files) || !report.files.length || report.files.length>256 || report.manifest?.schema!==1 || !Array.isArray(report.manifest.eligible) || !Array.isArray(report.manifest.omitted)) throw new Error('Missing source scope');
  if(createHash('sha256').update(JSON.stringify(report.manifest)).digest('hex')!==report.manifestHash) throw new Error('Source manifest identity mismatch');
  const paths=new Set();
  const totals={}, components={compiler:{},bytecode:{},stdlib:{}};
  for(const f of report.files) {
    if(!/^src\/(compiler|bytecode|stdlib)\/[a-z_]+\.panack$/.test(f.path) || paths.has(f.path) || !hash(f.hash) || !Array.isArray(f.exclusions)) throw new Error('Invalid source file');
    paths.add(f.path);
    const rows={lines:Object.values(f.lines || {}),functions:f.functions?.map(i=>i.state),branches:f.branches?.map(i=>i.state)};
    if(Object.keys(f.lines || {}).some(n=>! /^[1-9][0-9]*$/.test(n))) throw new Error('Invalid source line');
    for(const kind of Object.keys(rows)) {
      if(!Array.isArray(rows[kind]) || rows[kind].some(s=>!states.includes(s))) throw new Error('Invalid source states');
      const m=f.metrics?.[kind], counts={total:rows[kind].length,covered:rows[kind].filter(s=>s==='covered').length,unavailable:rows[kind].filter(s=>s==='unavailable').length,zero:rows[kind].filter(s=>s==='zero').length};
      if(!m || Object.keys(counts).some(k=>m[k]!==counts[k])) throw new Error('Invalid source metric counts');
      const expected=counts.total && !counts.unavailable ? 100*counts.covered/counts.total : null;
      if(m.percent!==expected || m.lower!==(counts.total?100*counts.covered/counts.total:null) || m.upper!==(counts.total?100*(counts.covered+counts.unavailable)/counts.total:null)) throw new Error('Invalid source percentage');
      totals[kind] ||= {total:0,covered:0,unavailable:0,zero:0};
      for(const k of Object.keys(counts)) totals[kind][k]+=counts[k];
      const component=components[f.path.split('/')[1]];
      component[kind] ||= {total:0,covered:0,unavailable:0,zero:0};
      for(const k of Object.keys(counts)) component[kind][k]+=counts[k];
    }
  }
  if(paths.size!==report.manifest.eligible.length || report.manifest.eligible.some(p=>!paths.has(p))) throw new Error('Missing eligible source file');
  function checkTotals(m,sum) {
    if(!m || Object.keys(sum).some(k=>m[k]!==sum[k]) || m.percent!==(sum.total && !sum.unavailable?100*sum.covered/sum.total:null) ||
        m.lower!==(sum.total?100*sum.covered/sum.total:null) || m.upper!==(sum.total?100*(sum.covered+sum.unavailable)/sum.total:null)) throw new Error('Invalid source totals');
  }
  for(const [kind,sum] of Object.entries(totals)) checkTotals(report.metrics?.[kind],sum);
  for(const [name,kinds] of Object.entries(components)) for(const kind of ['lines','functions','branches']) {
    const sum=kinds[kind] || {total:0,covered:0,unavailable:0,zero:0},m=report.components?.[name]?.[kind];
    checkTotals(m,sum);
  }
  const ids=['scope',...report.manifest.units.map(n=>'unit:'+n),...report.manifest.functional.map(n=>'functional:'+n),...report.manifest.compiler];
  if(!Array.isArray(report.sessions) || report.sessions.length!==1+report.manifest.units?.length+report.manifest.functional?.length+report.manifest.compiler?.length ||
      new Set(report.sessions.map(s=>s.id)).size!==report.sessions.length || new Set(report.sessions.map(s=>s.nonce)).size!==report.sessions.length ||
      report.sessions.some(s=>!ids.includes(s.id) || ! /^[a-f0-9]{32}$/.test(s.nonce) || !hash(s.artifact) || !hash(s.inventory) || !Number.isSafeInteger(s.executions) || s.executions<1)) throw new Error('Incomplete source collection');
  return report;
}
function buildDual(nativeInput,sourceInput,output,nativeSelection,sourceSelection) {
  // Both channels are pinned, monotonic and complete before replacing the deployed site.
  if(nativeSelection.schema!==1) throw new Error('Expected native selection');
  sourceSummary(sourceInput,sourceSelection);
  build(nativeInput,output,nativeSelection);
  fs.cpSync(sourceInput,path.join(output,'source'),{recursive:true});
  fs.writeFileSync(path.join(output,'source/provenance.json'),JSON.stringify(sourceSelection,null,2)+'\n');
  const index=path.join(output,'index.html');
  fs.writeFileSync(index,fs.readFileSync(index,'utf8').replace('</main>',`<hr><h2>Panackelty source coverage — next</h2><p>Compiler, bytecode tooling and standard library .panack source execution in the explicitly scoped native baseline. This development-branch report is separate from native C/main; it does not measure browser/WASI execution or the whole test suite.</p><p><a href="source/html/index.html">Browse .panack source coverage</a> · <a href="source/summary.json">Figures and exact scope</a> · <a href="source/provenance.json">Source report provenance</a></p><p>Source: <a href="https://github.com/sproates/panackelty/commit/${sourceSelection.coverage_sha}">${sourceSelection.coverage_sha}</a>; archived ${sourceSelection.archived_at}. <a href="https://github.com/sproates/panackelty/actions/runs/${sourceSelection.check_run}">Successful next validation</a>.</p></main>`));
  inspect(output);
}
async function verify(root,base) {
  const files=inspect(root);
  for (const file of files) {
    const response=await fetch(new URL(file,base),{signal:AbortSignal.timeout(15000),cache:'no-store'});
    if(!response.ok || !Buffer.from(await response.arrayBuffer()).equals(fs.readFileSync(path.join(root,file)))) throw new Error(`Published mismatch: ${file}`);
  }
}
module.exports={inspect,build,sourceSummary,buildDual,verify};
if(require.main===module) {
  const [mode,a,b,c,d,e]=process.argv.slice(2);
  Promise.resolve().then(()=>{
    if(mode==='build') return build(a,b,JSON.parse(fs.readFileSync(c,'utf8')));
    if(mode==='build-dual') return buildDual(a,b,c,JSON.parse(fs.readFileSync(d,'utf8')),JSON.parse(fs.readFileSync(e,'utf8')));
    if(mode==='verify') return verify(a,b);
    throw new Error('Expected build or verify');
  }).catch(e=>{console.error(e.message);process.exitCode=1;});
}
