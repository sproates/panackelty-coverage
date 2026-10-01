# Coverage publisher conventions

Use feature branches and PRs. Never push directly to main; each PR merge needs
explicit user approval. Commits use 218187+sproates@users.noreply.github.com.
Run `node --test tests/*.test.cjs` and `git diff --check` after changes. Update
README.md for changed publishing contracts. Test source identity, failed runs,
expiry, rollback prevention and malformed reports. No core build is needed here.
Keep coverage generation in sproates/panackelty. Do not execute report contents.
Do not change the main website until this independent site is verified live.
