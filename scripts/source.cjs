const repository = {owner: 'sproates', repo: 'panackelty'};
const fullName = 'sproates/panackelty';

async function select(github, channel = 'native') {
  if (!['native','source'].includes(channel)) throw new Error('Unknown coverage channel');
  const sourceBranch = channel === 'source' ? 'next' : 'main';
  const prefix = channel === 'source' ? 'source' : 'native';
  const {data: branch} = await github.rest.repos.getBranch({...repository, branch: sourceBranch});
  const workflows = channel === 'source'
    ? [{id:'source-coverage.yml',event:'workflow_dispatch'},{id:'check.yml',event:'push'}]
    : [{id:'check.yml',event:'push'}];
  const candidates = await Promise.all(workflows.map(async ({id,event}) => {
    let runs;
    try {
      runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
        ...repository, workflow_id:id, branch:sourceBranch, event, status:'success', per_page:100,
      });
    } catch (error) {
      // During rollout the new workflow may not exist on main yet.
      if (id === 'source-coverage.yml' && error.status === 404) return [];
      throw error;
    }
    return runs.filter(r => r.event === event && r.head_branch === sourceBranch &&
      r.status === 'completed' && r.conclusion === 'success' && r.path === `.github/workflows/${id}` &&
      r.repository?.full_name === fullName && r.head_repository?.full_name === fullName);
  }));
  const eligible = candidates.flat();
  // Run numbers are workflow-local. Creation time orders independent workflows;
  // attempts order reruns of the same run without promoting older source runs.
  if (channel === 'source') {
    for (const run of eligible) if (!Number.isFinite(Date.parse(run.created_at)))
      throw new Error('Missing source workflow creation time');
    eligible.sort((a,b) => Date.parse(b.created_at)-Date.parse(a.created_at) || b.run_attempt-a.run_attempt);
  } else eligible.sort((a,b) => b.run_number-a.run_number || b.run_attempt-a.run_attempt);
  for (const run of eligible) {
    const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts,
      {...repository, run_id: run.id, per_page: 100});
    const matches = artifacts.filter(a => a.name === `${prefix}-coverage-${run.id}`);
    if (!matches.length) continue; // Website/docs runs intentionally have no native report.
    if (matches.length !== 1) throw new Error('Ambiguous coverage artifacts');
    const artifact = matches[0];
    if (artifact.expired) throw new Error('Latest coverage expired; collect a fresh report');
    const {data: comparison} = await github.rest.repos.compareCommits({
      ...repository, base: run.head_sha, head: branch.commit.sha,
    });
    if (!['ahead','identical'].includes(comparison.status)) throw new Error(`Coverage source is not on current ${sourceBranch} ancestry`);
    const selected = {schema: 1, repository: fullName, coverage_sha: run.head_sha,
      check_run: run.id, run_number: run.run_number, run_attempt: run.run_attempt,
      artifact_id: artifact.id, archived_at: artifact.created_at};
    if (channel === 'source') Object.assign(selected,{schema:2,branch:'next',kind:'panack-source',workflow:run.path,run_created_at:run.created_at});
    validate(selected);
    return selected;
  }
  throw new Error(`No successful ${sourceBranch} coverage report`);
}
function validate(s) {
  if ((s.workflow !== undefined && !['.github/workflows/check.yml','.github/workflows/source-coverage.yml'].includes(s.workflow)) ||
      (s.run_created_at !== undefined && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(s.run_created_at) || !Number.isFinite(Date.parse(s.run_created_at)))) ||
      ((s.workflow === undefined) !== (s.run_created_at === undefined)) ||
      ![1,2].includes(s.schema) || (s.schema === 2 && (s.branch !== 'next' || s.kind !== 'panack-source')) || s.repository !== fullName || !/^[a-f0-9]{40}$/.test(s.coverage_sha) ||
      !['check_run','run_number','run_attempt','artifact_id'].every(k => Number.isSafeInteger(s[k]) && s[k] > 0) ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(s.archived_at) || !Number.isFinite(Date.parse(s.archived_at))) {
    throw new Error('Invalid coverage provenance');
  }
}
function same(a,b) {
  return ['schema','branch','kind','repository','coverage_sha','check_run','run_number','run_attempt','artifact_id','archived_at','workflow','run_created_at'].every(k=>a[k]===b[k]);
}
async function needsPublish(selected, url, fetcher=fetch) {
  const response=await fetcher(url,{signal:AbortSignal.timeout(15000),cache:'no-store'});
  if (response.status===404) return {publish:true,reason:'missing',live:null}; // First publication only.
  if (!response.ok) throw new Error('Cannot read live coverage provenance');
  const live=await response.json(); validate(live);
  if (live.schema !== selected.schema || live.branch !== selected.branch || live.kind !== selected.kind) throw new Error('Coverage channel mismatch');
  const crossWorkflow = selected.schema === 2 && (selected.workflow || live.workflow);
  const liveOrder = crossWorkflow ? Date.parse(live.run_created_at || live.archived_at) : live.run_number;
  const selectedOrder = crossWorkflow ? Date.parse(selected.run_created_at || selected.archived_at) : selected.run_number;
  if (liveOrder > selectedOrder ||
      (liveOrder === selectedOrder && live.run_attempt > selected.run_attempt)) {
    return {publish:false,reason:'live-newer',live};
  }
  return {publish:!same(live,selected),reason:null,live};
}
function publicationDecision(changes) {
  const newerLive=changes.slice(0,2).map((decision,index)=>({decision,index})).filter(({decision})=>decision.reason==='live-newer');
  return {publish:!newerLive.length && changes.some(decision=>decision===true || decision.publish),newerLive};
}
module.exports={select,validate,same,needsPublish,publicationDecision};
