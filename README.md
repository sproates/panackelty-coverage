# Panackelty coverage

Independent GitHub Pages hosting at https://coverage.panackelty.com/.
Two separately identified reports: native C/LLVM on core `main`, and the initial
`.panack` compiler/bytecode/stdlib source baseline on core **`next`**. Neither
report measures browser/WASI execution or implies whole-language coverage.

## Publication contract

Core remains responsible for generation and validation. This repository selects
only successful core `check.yml` pushes on `main` for native reports, and
successful `source-coverage.yml` manual-dispatch runs on `next` for source reports,
from `sproates/panackelty` itself. The weekly core scheduler dispatches that same
`next` workflow, preserving exact run/source SHA identity. Previous successful
`check.yml` pushes on `next` remain a migration fallback. It finds the newest eligible report independently for each channel,
checks ancestry, rejects expired artifacts and keeps its SHA, run, attempt and
artifact identity visible. Failed/newer or website-only checks do not erase the
last successful report. No core source or downloaded report is executed here.
Native `html/`, `summary.txt` and `provenance.json` URLs remain compatible;
the source report lives under `source/`, with its own `provenance.json`,
`summary.json`, timestamp, commit and successful Check link. Source summary
validation binds clean checkout identity, manifest, complete sessions, every
eligible file and honest known/unknown figures before publication. Unknown
measurements must not become zero hits or fabricated complete percentages.

Production publication runs every Monday at 05:23 UTC, after the core collection
schedule at 03:23 UTC, and through manual **Coverage Pages** dispatch. Pull requests
and pushes to this repository's `main` run only the separate checks workflow.
Collection is independent of release promotion/publication; an older report is
labelled by its timestamp and measured commit, not presented as current-release
coverage. Failed collection leaves the latest successful report selected; failures
in publication leave the deployed site intact and surface in GitHub Actions.
No PAT, cross-repository write access or core workflow write is required if the
built-in token's public artifact read succeeds.

Runs serialize under one production concurrency group. Selection happens after
entering it and is checked again after download/build. Live provenance prevents
older reports replacing newer ones independently per channel; exact duplicate
pairs skip deployment. If either live channel appears newer than its selected
source, the whole publication is skipped with a warning, preserving both live
reports while keeping the scheduled check green. Both pinned artifacts are
downloaded and validated on either channel update, so a source update cannot
erase the native report. Errors preserve the currently deployed site. The generated presentation.json
identifies renderer and stylesheet content. Changed presentation triggers
deployment even when report identities are unchanged; exact duplicates of all
three identities skip deployment. Styling requires no new core collection.
Report data, denominators, scope and independent provenance are retained.
The overview and detailed reports use the main website’s visual design.

The publisher uploads only the generated report, deploys through this
repository's `github-pages` environment and compares every live report file with
the artifact. GitHub Pages
must use GitHub Actions as its source. `GITHUB_TOKEN` is read-only in preparation;
only the deploy job has Pages/OIDC write permissions.

## Development and migration

Node 24, no npm dependencies. Run `node --test tests/*.test.cjs`.
The unit suite checks wrong-source/failed checks, pagination ordering, ancestry,
expiration, independent monotonic publication, source links, malformed/incomplete
source summaries, unavailable figures and unsafe/missing report files.

The compatibility link at panackelty.com/coverage/ leads to this independent host.
SC5 adds source reporting without changing the main website or core `main`.
See sproates/panackelty#131 and sproates/panackelty#187.
Independent hosting supersedes the planned combined-site coverage refresh work;
it does not by itself establish the website's latency budgets.

## Manual collection and publication

For an ad hoc refresh, dispatch **Source coverage** on the core repository's
`next` branch. Wait for its successful `source-coverage-RUN_ID` artifact, then
start a fresh **Coverage Pages** dispatch on this repository's `main`. Confirm
live provenance identifies the selected commit and artifact. Collection and
publication are not release prerequisites. Alpha.14 retains coverage-speed work.

Source runs from separate workflows are ordered by run creation time, not their
workflow-local run numbers. Provenance records workflow identity and creation time;
older published provenance without those fields uses its archive timestamp during
migration. Re-running an older source run cannot supersede a newer source run.

Do not rerun an old production preparation: duplicate `github-pages` artifacts in
one run can make deploy-pages reject ambiguous artifact selection.

The report landing page and detailed reports use the main website’s always-visible primary navigation and further-reading footer. The landing page also uses the editorial exploration links. Presentation identity includes these changes, allowing a chrome-only refresh without regenerating coverage.
