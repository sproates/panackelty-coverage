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

The publisher polls at minutes 7, 22, 37 and 52 of each hour, and supports manual
`Coverage Pages` dispatch. Scheduling may be delayed by GitHub; this is eventual
publication, not an immediate per-core-commit trigger. Public-repository schedules
can be disabled after 60 days without repository activity; check Actions and
re-enable when necessary. No PAT, cross-repository write access or core workflow
write is required if the built-in token's public artifact read succeeds. The PR
pipeline deliberately exercises that actual download before deployment approval.

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

PRs test selection and generate a preview artifact but cannot deploy. Production
uploads only the generated report, deploys through this repository's `github-pages`
environment and compares every live report file with the artifact. GitHub Pages
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

For an immediate refresh, start a fresh Coverage Pages workflow_dispatch on main.
Do not rerun an old production preparation: duplicate github-pages artifacts in
one run can make deploy-pages reject an ambiguous artifact selection.

The report landing page and detailed reports use the main website’s always-visible primary navigation and further-reading footer. The landing page also uses the editorial exploration links. Presentation identity includes these changes, allowing a chrome-only refresh without regenerating coverage.
