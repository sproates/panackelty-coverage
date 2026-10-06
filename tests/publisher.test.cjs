const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {select,validate,same,needsPublish}=require('../scripts/source.cjs');
const {build,sourceSummary,buildDual,inspect,verify,presentationIdentity,presentationNeedsPublish}=require('../scripts/report.cjs');
const {createHash}=require('node:crypto');
const run=(id,extra={})=>({id,run_number:id,run_attempt:1,head_sha:String(id).padStart(40,'a'),event:'push',head_branch:'main',status:'completed',conclusion:'success',path:'.github/workflows/check.yml',repository:{full_name:'sproates/panackelty'},head_repository:{full_name:'sproates/panackelty'},...extra});
const artifact=(id,extra={})=>({id:id+100,name:`native-coverage-${id}`,created_at:'2026-10-01T21:06:19Z',expired:false,...extra});
function api(runs,reports={},status='ahead') {
  const rest={actions:{listWorkflowRuns(){},listWorkflowRunArtifacts(){}},repos:{
    getBranch:async()=>({data:{commit:{sha:'f'.repeat(40)}}}),
    compareCommits:async()=>({data:{status}}),
  }};
  return {rest,paginate:async(fn,args)=>{
    assert.equal(args.owner,'sproates');assert.equal(args.repo,'panackelty');
    if(fn===rest.actions.listWorkflowRuns){assert.equal(args.workflow_id,'check.yml');return runs;}
    return reports[args.run_id]||[];
  }};
}
const selection={schema:1,repository:'sproates/panackelty',coverage_sha:'a'.repeat(40),check_run:5,run_number:5,run_attempt:1,artifact_id:105,archived_at:'2026-10-01T21:06:19Z'};
test('newest successful report survives newer website/docs runs and API ordering',async()=>{
  const s=await select(api([run(3),run(5),run(4)],{3:[artifact(3)],4:[artifact(4)]}));
  assert.equal(s.check_run,4);assert.equal(s.artifact_id,104);
});
test('wrong workflow, PR, fork and unsuccessful checks cannot contribute',async()=>{
  for(const extra of [{event:'pull_request'},{head_branch:'feature'},{status:'in_progress'},{conclusion:'failure'},
    {path:'.github/workflows/other.yml'},{repository:{full_name:'other/repo'}},{head_repository:{full_name:'other/repo'}},{head_repository:null}]) {
    const s=await select(api([run(6,extra),run(5)],{6:[artifact(6)],5:[artifact(5)]}));assert.equal(s.check_run,5);
  }
});
test('missing, expired, ambiguous, non-ancestral and API failures fail closed',async()=>{
  await assert.rejects(select(api([run(5)])),/No successful/);
  await assert.rejects(select(api([run(5),run(4)],{5:[artifact(5,{expired:true})],4:[artifact(4)]})),/expired/);
  await assert.rejects(select(api([run(5)],{5:[artifact(5),artifact(5)]})),/Ambiguous/);
  for(const status of ['behind','diverged']) await assert.rejects(select(api([run(5)],{5:[artifact(5)]},status)),/ancestry/);
  const broken=api([]);broken.paginate=async()=>{throw Error('API failed');};await assert.rejects(select(broken),/API failed/);
});
test('provenance validation rejects unsafe metadata',()=>{
  validate(selection);
  for(const bad of [{schema:2},{repository:'fork/repo'},{coverage_sha:'<script>'},{artifact_id:-1},{run_attempt:0},{archived_at:'bad'}]) assert.throws(()=>validate({...selection,...bad}),/Invalid/);
});
test('duplicate report skipped, newer restored, bootstrap permitted, rollback rejected',async()=>{
  const response=(live,status=200)=>async()=>({status,ok:status===200,json:async()=>live});
  assert.equal(await needsPublish(selection,'unused',response(null,404)),true);
  assert.equal(await needsPublish(selection,'unused',response(selection)),false);
  assert.equal(await needsPublish({...selection,run_number:6},'unused',response(selection)),true);
  await assert.rejects(needsPublish(selection,'unused',response({...selection,run_number:6})),/rollback/);
  await assert.rejects(needsPublish(selection,'unused',response({...selection,run_attempt:2})),/rollback/);
  await assert.rejects(needsPublish(selection,'unused',response({},500)),/Cannot read/);
  await assert.rejects(needsPublish(selection,'unused',response({})),/Invalid/);
  assert.equal(same(selection,{...selection,artifact_id:106}),false);
});
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'coverage-pages-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const input=path.join(root,'report');fs.mkdirSync(path.join(input,'html'),{recursive:true});
  fs.writeFileSync(path.join(input,'summary.txt'),'Lines: 95%\n');
  fs.writeFileSync(path.join(input,'html/index.html'),'<html><head><link href="style.css"></head><body><a href="source.html">Source</a></body></html>');
  fs.writeFileSync(path.join(input,'html/source.html'),'<html><head></head><body><a href="index.html">Index</a></body></html>');
  fs.writeFileSync(path.join(input,'html/style.css'),'body{color:black}');
  return {root,input,output:path.join(root,'public')};
}
test('standalone report retains source navigation and exact provenance without website assets',t=>{
  const {input,output}=fixture(t);build(input,output,selection);
  assert.equal(fs.readFileSync(path.join(input,'html/source.html'),'utf8'),fs.readFileSync(path.join(output,'html/source.html'),'utf8'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output,'provenance.json'))),selection);
  assert.match(fs.readFileSync(path.join(output,'index.html'),'utf8'),/does not measure the self-hosted compiler/);
  assert(!fs.existsSync(path.join(output,'playground')));inspect(output);
});
test('reject missing report, symlink and escaping navigation',t=>{
  const {input,root}=fixture(t);
  fs.writeFileSync(path.join(input,'html/index.html'),'<a href="../../outside">bad</a>');assert.throws(()=>inspect(input),/Escaping/);
  fs.writeFileSync(path.join(input,'html/index.html'),'<a href="https://example.test/">ok</a>');
  fs.symlinkSync(root,path.join(input,'html/link'));assert.throws(()=>inspect(input),/Unsafe/);fs.unlinkSync(path.join(input,'html/link'));
  fs.unlinkSync(path.join(input,'summary.txt'));assert.throws(()=>inspect(input),/Missing/);
});
test('live verification compares every file and rejects stale contents',async t=>{
  const {input,output}=fixture(t);build(input,output,selection);const previous=global.fetch;t.after(()=>global.fetch=previous);
  let stale=false;const visited=[];
  global.fetch=async url=>{const name=url.pathname.slice(1);visited.push(name);return {ok:true,arrayBuffer:async()=>stale?Buffer.from('stale'):fs.readFileSync(path.join(output,name))};};
  await verify(output,'https://example.test/');assert(visited.includes('html/source.html'));assert(visited.includes('provenance.json'));
  stale=true;await assert.rejects(verify(output,'https://example.test/'),/mismatch/);
});
test('workflow never deploys a PR and cross-repo artifact identity is pinned',()=>{
  const workflow=fs.readFileSync('.github/workflows/publish.yml','utf8');
  assert.match(workflow,/repository: sproates\/panackelty/);
  assert.match(workflow,/run-id: \$\{\{ steps.source.outputs.run \}\}/);
  assert.match(workflow,/if: github.event_name != 'pull_request' && needs.prepare.outputs.publish == 'true'/);
  assert.match(workflow,/cancel-in-progress: \$\{\{ github.event_name == 'pull_request' \}\}/);
  assert.match(workflow,/Coverage advanced during preparation/);
  assert.doesNotMatch(workflow,/secrets\.|contents: write/);
});
const sourceSelection={...selection,schema:2,branch:'next',kind:'panack-source'};
test('source channel selects only successful trusted next pushes and exact source artifacts',async()=>{
  const next=id=>run(id,{head_branch:'next'}),source=id=>artifact(id,{name:`source-coverage-${id}`});
  const client=api([next(6),run(7),next(5),next(8)] ,{5:[source(5)],6:[artifact(6)],7:[source(7)],8:[]});
  const s=await select(client,'source');assert.equal(s.check_run,5);assert.equal(s.schema,2);assert.equal(s.branch,'next');assert.equal(s.kind,'panack-source');
  for(const extra of [{event:'pull_request'},{conclusion:'failure'},{head_repository:{full_name:'fork/core'}},{path:'.github/workflows/other.yml'}]) {
    const s=await select(api([run(6,{head_branch:'next',...extra}),next(5)],{6:[source(6)],5:[source(5)]}),'source');assert.equal(s.check_run,5);
  }
  await assert.rejects(select(api([next(5)],{5:[source(5),source(5)]}),'source'),/Ambiguous/);
  await assert.rejects(select(api([next(5)],{5:[{...source(5),expired:true}]}),'source'),/expired/);
  await assert.rejects(select(api([next(5)],{5:[source(5)]},'diverged'),'source'),/ancestry/);
  await assert.rejects(select(client,'other'),/Unknown/);
});
test('source freshness and rollback are independent of native main provenance',async()=>{
  const response=live=>async()=>({status:200,ok:true,json:async()=>live});
  assert.equal(await needsPublish(sourceSelection,'unused',response(sourceSelection)),false);
  await assert.rejects(needsPublish(sourceSelection,'unused',response({...sourceSelection,run_number:6})),/rollback/);
  await assert.rejects(needsPublish(sourceSelection,'unused',response(selection)),/channel/);
  for(const bad of [{branch:'main'},{kind:'native'},{schema:3}]) assert.throws(()=>validate({...sourceSelection,...bad}),/Invalid/);
});
function sourceFixture(t) {
  const {root,input,output}=fixture(t),source=path.join(root,'source');fs.mkdirSync(path.join(source,'html'),{recursive:true});
  const metric=states=>({total:states.length,covered:states.filter(s=>s==='covered').length,unavailable:states.filter(s=>s==='unavailable').length,zero:states.filter(s=>s==='zero').length,
    percent:states.length&&!states.includes('unavailable')?100*states.filter(s=>s==='covered').length/states.length:null,
    lower:states.length?100*states.filter(s=>s==='covered').length/states.length:null,upper:states.length?100*states.filter(s=>s!=='zero').length/states.length:null});
  const empty={lines:metric([]),functions:metric([]),branches:metric([])},metrics={lines:metric(['unavailable']),functions:metric(['zero']),branches:metric([])};
  const manifest={schema:1,eligible:['src/compiler/main.panack'],units:[],functional:[],compiler:[],omitted:[{paths:['outside scope'],reason:'Explicit initial corpus'}]};
  const report={schema:1,repository:selection.repository,branch:'next',commit:selection.coverage_sha,clean:true,generatedAt:selection.archived_at,compiler:'a'.repeat(64),vm:'b'.repeat(64),manifestHash:createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),manifest,
    sessions:[{id:'scope',nonce:'1'.repeat(32),executions:1,artifact:'a'.repeat(64),inventory:'b'.repeat(64)}],metrics,components:{compiler:metrics,bytecode:empty,stdlib:empty},
    files:[{path:'src/compiler/main.panack',hash:'c'.repeat(64),lines:{1:'unavailable'},functions:[{id:'declaration/0',state:'zero'}],branches:[],exclusions:[],metrics}]};
  fs.writeFileSync(path.join(source,'summary.txt'),'Source scope summary\n');fs.writeFileSync(path.join(source,'summary.json'),JSON.stringify(report));fs.writeFileSync(path.join(source,'html/index.html'),'<html><head></head><body><a href="../summary.json">Scope</a></body></html>');
  return {root,input,source,output,report};
}
test('dual publication preserves native URLs and exposes separately pinned next source report',t=>{
  const {input,source,output}=sourceFixture(t);buildDual(input,source,output,selection,sourceSelection);
  assert.equal(fs.readFileSync(path.join(output,'summary.txt'),'utf8'),'Lines: 95%\n');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output,'provenance.json'))),selection);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output,'source/provenance.json'))),sourceSelection);
  assert.match(fs.readFileSync(path.join(output,'index.html'),'utf8'),/source\/html\/index.html/);inspect(output);
  const overview=fs.readFileSync(path.join(output,'index.html'),'utf8');
  assert.match(overview,/Test coverage/);assert.match(overview,/Unavailable/);
  assert.doesNotMatch(overview,/NaN|undefined/);
  assert.match(fs.readFileSync(path.join(output,'source/html/index.html'),'utf8'),/\.\.\/\.\.\/assets\/coverage.css/);
  assert.match(fs.readFileSync(path.join(output,'html/source.html'),'utf8'),/class="report-detail"/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output,'source/summary.json'))),JSON.parse(fs.readFileSync(path.join(source,'summary.json'))));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output,'presentation.json'))),presentationIdentity());
});
test('presentation changes publish independently without lowering report freshness',async()=>{
  const response=(value,status=200)=>async()=>({status,ok:status===200,json:async()=>value});
  assert.equal(await presentationNeedsPublish('unused',response(null,404)),true);
  assert.equal(await presentationNeedsPublish('unused',response(presentationIdentity())),false);
  assert.equal(await presentationNeedsPublish('unused',response({schema:1,hash:'0'.repeat(64)})),true);
  await assert.rejects(presentationNeedsPublish('unused',response({},500)),/Cannot read/);
  await assert.rejects(presentationNeedsPublish('unused',response({schema:1,hash:'bad'})),/Invalid/);
});
test('malformed, stale, incomplete or dishonest source summaries cannot replace native site',t=>{
  const {source,report}=sourceFixture(t);
  const bad=[{...report,clean:false},{...report,clean:'true'},{...report,commit:'b'.repeat(40)},{...report,branch:'main'},{...report,manifestHash:'f'.repeat(64)},{...report,generatedAt:'2099-01-01T00:00:00Z'},{...report,sessions:[]},{...report,files:[]}];
  const clone=()=>JSON.parse(JSON.stringify(report));
  const percentage=clone();percentage.files[0].metrics.lines.percent=100;bad.push(percentage);
  const component=clone();component.components.compiler.lines.covered=1;bad.push(component);
  const overall=clone();overall.metrics.lines.percent=100;bad.push(overall);
  const omitted=clone();omitted.manifest.eligible.push('src/stdlib/unused.panack');bad.push(omitted);
  const scope=clone();scope.sessions[0].id='wrong';bad.push(scope);
  for(const data of bad) {fs.writeFileSync(path.join(source,'summary.json'),JSON.stringify(data));assert.throws(()=>sourceSummary(source,sourceSelection));}
  fs.writeFileSync(path.join(source,'summary.json'),JSON.stringify(report));assert.equal(sourceSummary(source,sourceSelection).metrics.lines.percent,null);
});
