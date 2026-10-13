# Panackelty coverage

Independent GitHub Pages hosting at https://coverage.panackelty.com/.
Two separately identified reports: native C/LLVM on core `main`, and the initial
`.panack` compiler/bytecode/stdlib source baseline on core **`next`**. Neither
report measures browser/WASI execution or implies whole-language coverage.

## Publication contract

Core remains responsible for generation and validation. This repository selects
only successful `push` runs of core's `.github/workflows/check.yml` on `main`
for native reports and `next` for source reports, from `sproates/panackelty`
itself. It finds the newest eligible report independently for each channel,
checks ancestry, rejects expired artifacts and keeps its SHA, run, attempt and
artifact identity visible. Failed/newer or website-only checks do not erase the
last successful report. No core source or downloaded report is executed here.
Native `html/`, `summary.txt` and `provenance.json` URLs remain compatible;
the source report lives under `source/`, with its own `provenance.json`,
`summary.json`, timestamp, commit and successful Check link. Source summary
validation binds clean checkout identity, manifest, complete sessions, every
eligible file and honest known/unknown figures before publication. Unknown
measurements must not become zero hits or fabricated complete percentages.

Production publication runs only through a manual `Coverage Pages` dispatch.
Pull requests and pushes to this repository's `main` run the separate coverage
checks workflow and do not publish. The publisher no longer polls on a schedule,
so stale source coverage on core `next` cannot cause recurring publisher failures.
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

The on-demand publisher uploads only the generated report, deploys through this
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

## Release preparation

Refresh and publish source coverage as a release-preparation check, not during
ordinary development. On the release candidate's core `next` head, request a
fresh source collection using the documented `[source-coverage]` refresh and
wait for its `Check` run to succeed and archive `source-coverage-RUN_ID`. Then
start a fresh `Coverage Pages` workflow_dispatch on this repository's `main` and
verify that live provenance identifies the intended candidate before proceeding
with release promotion. The publisher selects reports; it does not collect
source coverage itself. It also refreshes native coverage from core `main` when
that report is newer.

For an ad hoc refresh outside release preparation, use the same fresh manual
dispatch. Do not rerun an old production preparation: duplicate `github-pages`
artifacts in one run can make deploy-pages reject an ambiguous artifact selection.

The report landing page and detailed reports use the main website’s always-visible primary navigation and further-reading footer. The landing page also uses the editorial exploration links. Presentation identity includes these changes, allowing a chrome-only refresh without regenerating coverage.
