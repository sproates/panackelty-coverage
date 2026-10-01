# Panackelty coverage

Independent GitHub Pages hosting for the native C VM's LLVM HTML coverage report.
It does not measure Panackelty compiler/source coverage. The intended site is
https://sproates.github.io/panackelty-coverage/ (not live until first deployment).

## Publication contract

Core remains responsible for generation and validation. This repository selects
only successful `push` runs of core's `.github/workflows/check.yml` on `main`,
from `sproates/panackelty` itself. It finds the newest eligible native report,
checks ancestry, rejects expired artifacts and keeps its SHA, run, attempt and
artifact identity visible. Failed/newer or website-only checks do not erase the
last successful report. No core source or downloaded report is executed here.

The publisher polls at minutes 7, 22, 37 and 52 of each hour, and supports manual
`Coverage Pages` dispatch. Scheduling may be delayed by GitHub; this is eventual
publication, not an immediate per-core-commit trigger. Public-repository schedules
can be disabled after 60 days without repository activity; check Actions and
re-enable when necessary. No PAT, cross-repository write access or core workflow
change is required if the built-in token's public artifact read succeeds. The PR
pipeline deliberately exercises that actual download before deployment approval.

Runs serialize under one production concurrency group. Selection happens after
entering it and is checked again after download/build. Live provenance prevents
older reports replacing newer ones; exact duplicate reports skip deployment.
Errors preserve the currently deployed site. Publisher code updates with an
identical report also skip deployment; use a newer source report for a changed
landing page. A dedicated force-refresh option is not provided in this slice.

PRs test selection and generate a preview artifact but cannot deploy. Production
uploads only the generated report, deploys through this repository's `github-pages`
environment and compares every live report file with the artifact. GitHub Pages
must use GitHub Actions as its source. `GITHUB_TOKEN` is read-only in preparation;
only the deploy job has Pages/OIDC write permissions.

## Development and migration

Node 24, no npm dependencies. Run `node --test tests/*.test.cjs`.
The unit suite checks wrong-source/failed checks, pagination ordering, ancestry,
expiration, monotonic publication, source links and unsafe/missing report files.

The existing report at panackelty.com/coverage/ stays live during bootstrap.
After this site's publisher is merged with explicit approval and verified live,
core can replace its coverage directory with a compatibility link and remove the
combined website/report deployment machinery. See sproates/panackelty#187.
Independent hosting supersedes the planned combined-site coverage refresh work;
it does not by itself establish the website's latency budgets.
