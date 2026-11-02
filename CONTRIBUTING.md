# Contributing

Contribute a demonstrated improvement to map design decisions or implementation.
Start with a small change: a real failure, a precise adapter correction, a
reproducible example, or a behavioral evaluation with raw evidence.

## Development

Use Node 22.12+, npm, and Python 3.10+. Follow the setup and validation commands
in [README](README.md). Keep the skill self-contained: files installed under
`skills/map-aesthetic` must not depend on repository-only docs or development tools.

## Adapter changes

Record the exact SDK version, wrapper/loader, layer type, editable surface,
units, readiness signal, style-reset behavior, cleanup, and rollback. Link the
official version-matched documentation and give the check date. Identify native,
approximate, unavailable, and unverified capabilities separately.

Separate documentation coverage from runtime evidence. A hosted screenshot is
not a substitute for source, setup details, and a reproducible scenario. Do not
claim that all versions, accounts, styles, 2D/3D modes, or wrappers were tested
because one integration worked.

New engines need a routing entry, focused reference, scope-specific evaluation,
and an honest coverage entry in both READMEs. Executable adapters are not required
by the current architecture. Add one only with an actual reusable requirement.

## Themes and examples

Include purpose, data semantics, and real units. Validate token files and check
the intended background, selection state, label readability, and legend mapping.
Do not change classifications or coordinates to make a visual example look better.
Demonstration fixtures must be redistributable and clearly identify synthetic data.
Keep provider keys, private styles, customer screenshots, and production data out
of the repository. This does not prevent normal account-based testing outside it.

## Evidence

Use [visual QA](skills/map-aesthetic/references/visual-qa.md) for map behavior and
[eval cases](evals/cases.md) for agent decisions. Report passed, failed, and not-run
checks. Preserve raw inputs for behavioral cases and keep suggested answers out
of the executing agent's prompt. Aesthetic judgments should identify an observable
problem and its effect on the user task.

## Pull requests

Explain the trigger, previous problem, resulting behavior, and actual validation.
Update both READMEs when support claims or installation instructions change.
Update [verification](docs/verification.md) only for checks actually executed.
Keep planned integrations in the roadmap until their evidence exists.

By contributing, you agree to license your original contribution under the
repository's MIT license. Preserve third-party notices and identify external assets.
