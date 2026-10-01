const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {select,validate,same,needsPublish}=require('../scripts/source.cjs');
const {build,inspect,verify}=require('../scripts/report.cjs');
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
  fs.writeFileSync(path.join(input,'html/index.html'),'<a href="source.html">Source</a><link href="style.css">');
  fs.writeFileSync(path.join(input,'html/source.html'),'<a href="index.html">Index</a>');
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
