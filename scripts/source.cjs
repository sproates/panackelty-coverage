const repository = {owner: 'sproates', repo: 'panackelty'};
const fullName = 'sproates/panackelty';

async function select(github) {
  const {data: branch} = await github.rest.repos.getBranch({...repository, branch: 'main'});
  const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
    ...repository, workflow_id: 'check.yml', branch: 'main', event: 'push', status: 'success', per_page: 100,
  });
  const eligible = runs.filter(r => r.event === 'push' && r.head_branch === 'main' &&
    r.status === 'completed' && r.conclusion === 'success' && r.path === '.github/workflows/check.yml' &&
    r.repository?.full_name === fullName && r.head_repository?.full_name === fullName);
  eligible.sort((a,b) => b.run_number-a.run_number || b.run_attempt-a.run_attempt);
  for (const run of eligible) {
    const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts,
      {...repository, run_id: run.id, per_page: 100});
    const matches = artifacts.filter(a => a.name === `native-coverage-${run.id}`);
    if (!matches.length) continue; // Website/docs runs intentionally have no native report.
    if (matches.length !== 1) throw new Error('Ambiguous coverage artifacts');
    const artifact = matches[0];
    if (artifact.expired) throw new Error('Latest coverage expired; run full core Check');
    const {data: comparison} = await github.rest.repos.compareCommits({
      ...repository, base: run.head_sha, head: branch.commit.sha,
    });
    if (!['ahead','identical'].includes(comparison.status)) throw new Error('Coverage source is not on current main ancestry');
    const selected = {schema: 1, repository: fullName, coverage_sha: run.head_sha,
      check_run: run.id, run_number: run.run_number, run_attempt: run.run_attempt,
      artifact_id: artifact.id, archived_at: artifact.created_at};
    validate(selected);
    return selected;
  }
  throw new Error('No successful main coverage report');
}
function validate(s) {
  if (s.schema !== 1 || s.repository !== fullName || !/^[a-f0-9]{40}$/.test(s.coverage_sha) ||
      !['check_run','run_number','run_attempt','artifact_id'].every(k => Number.isSafeInteger(s[k]) && s[k] > 0) ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(s.archived_at) || !Number.isFinite(Date.parse(s.archived_at))) {
    throw new Error('Invalid coverage provenance');
  }
}
function same(a,b) {
  return ['schema','repository','coverage_sha','check_run','run_number','run_attempt','artifact_id','archived_at'].every(k=>a[k]===b[k]);
}
async function needsPublish(selected, url, fetcher=fetch) {
  const response=await fetcher(url,{signal:AbortSignal.timeout(15000),cache:'no-store'});
  if (response.status===404) return true; // First publication only.
  if (!response.ok) throw new Error('Cannot read live coverage provenance');
  const live=await response.json(); validate(live);
  if (live.run_number > selected.run_number ||
      (live.run_number === selected.run_number && live.run_attempt > selected.run_attempt)) throw new Error('Refusing coverage rollback');
  return !same(live,selected);
}
module.exports={select,validate,same,needsPublish};
