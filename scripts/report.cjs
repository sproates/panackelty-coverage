const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {validate}=require('./source.cjs');
function presentationIdentity() {
  const hash=createHash('sha256');
  for(const file of [__filename,path.join(__dirname,'../assets/coverage.css')]) hash.update(fs.readFileSync(file));
  return {schema:1,hash:hash.digest('hex')};
}
async function presentationNeedsPublish(url,fetcher=fetch) {
  const response=await fetcher(url,{signal:AbortSignal.timeout(15000),cache:'no-store'});
  if(response.status===404) return true;
  if(!response.ok) throw new Error('Cannot read live presentation identity');
  const live=await response.json();
  if(live.schema!==1 || !/^[a-f0-9]{64}$/.test(live.hash)) throw new Error('Invalid presentation identity');
  return live.hash!==presentationIdentity().hash;
}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function header(home='index.html') {
  return `<a class="skip-link" href="#main">Skip to content</a><header class="site-header"><a class="brand" href="https://panackelty.com/"><span class="brand-mark" aria-hidden="true">P</span><span>Panackelty</span></a><nav aria-label="Main navigation"><a href="https://panackelty.com/capabilities/">Capabilities</a><a href="https://panackelty.com/playground/">Try it online</a><a href="${home}" aria-current="page">Test coverage</a><a href="https://github.com/sproates/panackelty">GitHub</a></nav></header>`;
}
function provenance(s,prefix) {
  return `<p class="provenance">Report archived <time datetime="${s.archived_at}">${s.archived_at.replace('T',' ').replace('Z',' UTC')}</time><br>Source <a href="https://github.com/sproates/panackelty/commit/${s.coverage_sha}"><code>${s.coverage_sha.slice(0,7)}</code></a> · <a href="https://github.com/sproates/panackelty/actions/runs/${s.check_run}">Passed validation</a> · <a href="${prefix}provenance.json">Provenance</a></p>`;
}
function metric(label,value,count='') {
  return `<div><span class="metric-value">${escape(value)}</span><span class="metric-label">${label}${count?`<br>${escape(count)}`:''}</span></div>`;
}
function sourceMetric(label,m) {
  return metric(label,m.percent===null?'Unavailable':m.percent.toFixed(2)+'%',`${m.covered.toLocaleString('en-US')} / ${m.total.toLocaleString('en-US')}`);
}
function landing(native,source,report,summary) {
  const percentages=summary.split('\n').find(line=>/^TOTAL\s/.test(line))?.match(/[0-9.]+%/g);
  const nativeMetrics=percentages?.length===4?metric('Lines',percentages[2])+metric('Functions',percentages[1])+metric('Branch outcomes',percentages[3]):'<p>Exact native figures are available in the report below.</p>';
  const sourceCard=report?`<section class="report-card" aria-labelledby="source-title"><span class="badge">.PANACK SOURCE · NEXT</span><h2 id="source-title">The language, measured.</h2><p>Execution coverage for the compiler, bytecode tooling and standard library. ${report.files.length} production files across ${report.sessions.reduce((n,s)=>n+s.executions,0)} fresh executions.</p><div class="metrics">${sourceMetric('Executable start lines',report.metrics.lines)}${sourceMetric('Functions',report.metrics.functions)}${sourceMetric('Source outcomes',report.metrics.branches)}</div><div class="actions"><a class="button primary" href="source/html/index.html">Explore source coverage →</a><a class="button" href="source/summary.json">Figures and test scope</a></div><div class="table-wrap"><table><caption class="eyebrow">Coverage by component</caption><thead><tr><th scope="col">Component</th><th scope="col">Lines</th><th scope="col">Functions</th><th scope="col">Source outcomes</th></tr></thead><tbody>${Object.entries(report.components).map(([name,m])=>`<tr><th scope="row">${escape(name==='stdlib'?'Standard library':name[0].toUpperCase()+name.slice(1))}</th>${['lines','functions','branches'].map(k=>`<td>${m[k].percent===null?'Unavailable':m[k].percent.toFixed(2)+'%'} <span>(${m[k].covered}/${m[k].total})</span></td>`).join('')}</tr>`).join('')}</tbody></table></div>${provenance(source,'source/')}</section>`:'';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#15130f"><meta name="description" content="Panackelty test coverage for compiler, bytecode tooling, standard library and native C VM."><title>Test coverage · Panackelty</title><link rel="stylesheet" href="assets/coverage.css"></head><body>${header()}<main id="main"><section class="hero"><p class="eyebrow">Engineering evidence</p><h1>Test coverage.<br><em>With context.</em></h1><p class="lede">See what the tests execute, where gaps remain, and which revision each report describes.</p></section>${sourceCard}<section class="report-card" aria-labelledby="native-title"><span class="badge">NATIVE C VM · MAIN</span><h2 id="native-title">The runtime, measured.</h2><p>LLVM coverage of the native C VM: execution, memory handling and host operations. This report does not measure the self-hosted compiler or the whole language.</p><div class="metrics">${nativeMetrics}</div><div class="actions"><a class="button primary" href="html/index.html">Explore native VM coverage →</a><a class="button" href="summary.txt">Text summary</a></div>${provenance(native,'')}</section><aside class="scope-note"><h2>Read the numbers with their scope.</h2><p>The two reports measure different code and can describe different commits. Source coverage uses an explicit native test corpus; it does not cover the whole canonical suite or browser/WASI execution. Missing measurements are unavailable, never fabricated zeroes. Coverage measures execution, not assertion quality or freedom from defects.</p><p>Reports are published independently from the website. Their timestamps, source commits and validation links make freshness visible.</p></aside></main><footer><a class="brand" href="https://panackelty.com/"><span class="brand-mark" aria-hidden="true">P</span><span>Panackelty</span></a><p>Experimental. Open source. Still evolving.</p><p><a href="https://panackelty.com/capabilities/">Capabilities</a> · <a href="https://github.com/sproates/panackelty/blob/main/LICENSE">MIT</a> · <a href="https://github.com/sproates/panackelty">GitHub</a> · <a href="#main">Back to top</a></p></footer></body></html>\n`;
}
function themeReports(output,dir) {
  for(const file of inspect(output).filter(f=>f.startsWith(dir+'/')&&f.endsWith('.html'))) {
    const full=path.join(output,file),relative=target=>path.posix.relative(path.posix.dirname(file),target);
    let html=fs.readFileSync(full,'utf8');
    html=html.replace('</head>',`<link rel="stylesheet" href="${relative('assets/coverage.css')}"></head>`)
      .replace(/<body>/i,`<body class="report-detail">${header(relative('index.html'))}<main id="main">`)
      .replace('</body>','</main></body>');
    fs.writeFileSync(full,html);
  }
}
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
  fs.mkdirSync(path.join(output,'assets'),{recursive:true});
  fs.copyFileSync(path.join(__dirname,'../assets/coverage.css'),path.join(output,'assets/coverage.css'));
  fs.writeFileSync(path.join(output,'presentation.json'),JSON.stringify(presentationIdentity())+'\n');
  fs.writeFileSync(path.join(output,'index.html'),landing(selection,null,null,fs.readFileSync(path.join(input,'summary.txt'),'utf8')));
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
  const report=sourceSummary(sourceInput,sourceSelection);
  fs.writeFileSync(path.join(output,'index.html'),landing(nativeSelection,sourceSelection,report,fs.readFileSync(path.join(nativeInput,'summary.txt'),'utf8')));
  themeReports(output,'html');
  themeReports(output,'source/html');
  inspect(output);
}
async function verify(root,base) {
  const files=inspect(root);
  for (const file of files) {
    const response=await fetch(new URL(file,base),{signal:AbortSignal.timeout(15000),cache:'no-store'});
    if(!response.ok || !Buffer.from(await response.arrayBuffer()).equals(fs.readFileSync(path.join(root,file)))) throw new Error(`Published mismatch: ${file}`);
  }
}
module.exports={inspect,build,sourceSummary,buildDual,verify,presentationIdentity,presentationNeedsPublish};
if(require.main===module) {
  const [mode,a,b,c,d,e]=process.argv.slice(2);
  Promise.resolve().then(()=>{
    if(mode==='build') return build(a,b,JSON.parse(fs.readFileSync(c,'utf8')));
    if(mode==='build-dual') return buildDual(a,b,c,JSON.parse(fs.readFileSync(d,'utf8')),JSON.parse(fs.readFileSync(e,'utf8')));
    if(mode==='verify') return verify(a,b);
    throw new Error('Expected build or verify');
  }).catch(e=>{console.error(e.message);process.exitCode=1;});
}
