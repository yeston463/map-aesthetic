# Preparing a GitHub release

Canonical repository: [yeston463/map-aesthetic](https://github.com/yeston463/map-aesthetic).
Pushing source commits and publishing a versioned GitHub Release are separate
maintainer actions. No GitHub Release is implied by version strings.

## Before publishing

1. Read both READMEs and the verification record. Keep runtime claims limited to
   actual evidence. Set the project description to the capability it currently has.
2. Confirm the MIT license attribution and dependency notices match the intended
   ownership. Add an owner, repository URL, or issue links only when they exist.
3. Run the commands below in a fresh clone or clean checkout.
4. Review generated demo screenshots and ensure no private assets or credentials
   entered the tracked files. Generated dependencies and local test artifacts are ignored.
5. For a first push to a new fork or another owner, create an empty repository.
   Do not initialize a second README/license when pushing this prepared project.
   Clones of the canonical repository already have `origin` configured.
6. Commit reviewed files and push `main` to the intended remote. For the canonical
   repository, the commands are:

```sh
git add .
git commit -m "feat: add map aesthetic skill and local demo"
git push -u origin main
```

If `origin` is missing, add the intended repository's URL before pushing. Inspect
an existing remote before changing it; do not overwrite another remote.

## Validation

```sh
npm ci
python -m pip install -r requirements-dev.txt
python scripts/check_project.py
python scripts/check_citations.py --offline
python -m unittest discover -s tests -v
npm run build
npx playwright install chromium
npm run test:browser
python scripts/check_citations.py
```

The last command needs network. Run it before a release: it resolves every cited
page and confirms each adapter claim still appears there. Exit code 2 means the
network blocked the conclusion, which is not a pass and must not be recorded as one.

The CI workflow repeats structural, validator, build, and browser checks on pushes
and pull requests, and re-checks live citations weekly. It has read-only repository
permissions and does not deploy a site.
The behavioral scenario suite is manual; record an execution separately from CI, and
label a run against a reduced fixture as exactly that rather than as a case pass.

## Version and artifacts

The initial project version is `0.2.0`, recorded in `package.json` and its lockfile.
The theme contract has an independent `schemaVersion` (`1.1`). Documentation
clarifications need not break the contract; incompatible token changes do.

After checks pass, create a `v0.2.0` tag and a GitHub release if desired. Include
the skill folder as a ZIP with `map-aesthetic/SKILL.md` at its root directory;
omit `node_modules`, test artifacts, `.git`, and local credentials. A GitHub source
archive also contains the skill at `skills/map-aesthetic`.

Create the skill-only archive locally with:

```sh
python scripts/package_skill.py
```

The default output is `.tmp/releases/map-aesthetic-0.2.0.zip`; the command prints
its file count and SHA-256. The archive includes the skill's MIT notice. It does
not publish or upload anything. Extract its `map-aesthetic` directory into the
chosen skill location.

The `dist` directory is the built demo. It may be hosted separately after choosing
a hosting destination and base path. GitHub Pages is not enabled by this project.

Suggested repository topics: `agent-skills`, `cartography`, `web-mapping`,
`leaflet`, `arcgis`, `mapbox`, `amap`, `baidu-maps`, `design-tokens`.
