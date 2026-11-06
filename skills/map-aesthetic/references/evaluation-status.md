# Evaluation status

**This file is a status record, not a claim of usefulness.** It separates three
things that are easy to conflate: the rules work, the demo passes them, and the
skill changes what an agent produces. Only the first two have evidence so far.

## What has been shown

| Statement | Evidence | Scope |
| --- | --- | --- |
| The 35 executable rules can fire and can stay silent | `tests-node/rule-fixtures.test.mjs`: one violation fixture and one compliant fixture per rule; 26 browser + 9 static; `output/rule-coverage.json` | Synthetic fixtures written by hand. Proves the rules are not dead code. Proves nothing about real projects. |
| The bundled demo has no finding from any implemented rule in the states visited | `npm run verify:demo`: three directions × four widths, with and without an open popup; `output/consistency/` | One hand-authored page. SKIP cells are reported, not counted as PASS. |
| The documented claims still match the demo source | `scripts/audit_claims.py`: 17 claims, `output/claim-audit.json` | Internal consistency of the repository, not design quality. |
| The release archive contains exactly the reviewed files | `scripts/verify_skill_package.py`: manifest, hashes, links, frontmatter, syntax | Packaging integrity. Not a runtime load test. |

All of the above are **authored artefacts checked against authored rules**. A
checker that passes on a page its author also wrote is not evidence that an
agent given this skill would produce a better page.

## What has not been shown

1. **One directional preference, not a comparative result.** The public
   experiment records describe three paired runs: in the first two the B arm did
   not deliver (a tool cap, then a request cap), which is a budget/reading-depth
   failure and **not** an aesthetic loss. In the third both arms delivered and
   passed the gates. On 2026-11-06 the user scored that blind pair as
   `PANEL-1-R` and added "还是太丑了" (still too ugly). Unblinding was performed
   only after that score was recorded: `PANEL-1-R` = arm-a (control),
   `PANEL-1-L` = arm-b (skill available). So the **relative preference fell on
   the control arm**, while neither panel was endorsed. The record is
   `rater_preference_20261106.json` and
   `RESULT-EXP-20261105-MAP-DS-05-BLIND-REVIEW.md`; the blank original sheet
   was left untouched.
2. **No dimension scores and no effect-size estimate.** The scoring sheet asks
   for three 1–5 dimension scores per panel. Only an overall preference was
   supplied; the three scores are **not** inferred, so the sheet's aggregation
   cannot be computed. One pair, one rater: no confidence interval, no repeated
   runs, no claim about a population of tasks. Neither "the skill makes maps
   worse" nor "the skill is ineffective / validated" follows from this.
   The anonymisation spec in that prep still carries `prep_id MAPAB04-DS-P02`
   and `rule_status PENDING_USER_CONFIRMATION`, and the rater sheet says
   `UNCONFIRMED_BEFORE_EXECUTION` — a provenance gap that was recorded, not
   silently repaired.
3. **No end-to-end load test.** The package has valid frontmatter and resolves
   its own links, but no agent runtime has been shown to load this archive as a
   skill and follow it on a fresh project. That is a separate integration test.
4. **No cross-project validation.** Every passing run to date is on the bundled
   synthetic case. Leaflet, MapLibre, ArcGIS, AMap and Baidu adapters are
   documentation, not verified behaviour across real SDK versions.

## Protocol for a real effectiveness result

1. The user scores the anonymous left/right images while blind. Only after the
   score is recorded is the arm mapping revealed. Done once on 2026-11-06
   (directional preference only). A **complete** run still needs the three
   dimension scores, a registered rater, and a confirmed anonymisation spec;
   no old score is filled in by the assistant and the private ledger is not
   read before a score exists.
2. Any further paired run needs explicit authorisation before starting a paid
   API: a fresh independent experiment version, identical task, public input,
   model parameters and budget for both arms, with skill availability as the
   only difference. Neither arm may read historical results, the other arm's
   output, scoring records, or calibration answers.
3. Both arms must actually deliver and pass the same gates before a blind
   package is produced; a non-delivering arm invalidates the pair rather than
   counting as a loss.
4. Report delivery, gate results, request/tool counts, cost and the blind
   preference with its uncertainty. State plainly what could not be measured.

## How to describe the current state

Acceptable: "the checkers are covered by fixtures and the bundled demo passes
them"; "the package is complete and self-consistent"; "one blind pair recorded a
relative preference for the control arm, with no dimension scores, so
effectiveness remains unmeasured".

Not acceptable: "the skill works", "the skill improves map design", "A/B
validated", "0 FAIL 0 WARN means accepted". See
[implementation status](implementation-status.md) for the per-claim ledger.
