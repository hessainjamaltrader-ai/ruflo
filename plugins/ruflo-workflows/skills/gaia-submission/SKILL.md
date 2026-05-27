---
name: gaia-submission
description: Walk through a complete GAIA benchmark→submit flow — from key resolution through HAL-compatible package generation
argument-hint: "[level] [limit] [models]"
allowed-tools: Bash mcp__claude-flow__memory_store mcp__claude-flow__memory_search mcp__claude-flow__memory_list mcp__claude-flow__hooks_post_task mcp__claude-flow__hooks_pre_task
---

# GAIA Submission Skill

Walk Claude Code through every step needed to go from a clean environment to a
signed, HAL-compatible submission package ready to upload to the Princeton
GAIA leaderboard.

## When to use

When the user wants to:
- Run a benchmark and submit results to the HAL leaderboard
- Package an existing results file into a submission archive
- Confirm their environment is ready for a benchmark run

## Prerequisites

Before starting, confirm these are available:

| Requirement | Check |
|-------------|-------|
| `ANTHROPIC_API_KEY` | `echo ${ANTHROPIC_API_KEY:0:8}...` (should show `sk-ant-...`) |
| `HF_TOKEN` | `echo ${HF_TOKEN:0:5}...` (should show `hf_...`) |
| Node.js 20+ | `node --version` |
| CLI built | `node v3/@claude-flow/cli/bin/cli.js --version` |

## Validate before submitting (pre-flight checklist)

**Always run this before starting a benchmark run or packaging results.**

```bash
/gaia validate
```

This runs all pre-flight checks including:
- All required env keys (`ANTHROPIC_API_KEY`, `HF_TOKEN`)
- Recommended keys (`GOOGLE_AI_API_KEY` for grounded_query, `GOOGLE_CUSTOM_SEARCH_CX` for Google Search)
- TypeScript build clean (0 errors)
- max_turns default = 12 (PR #2178 applied)
- Tool catalogue: 6 tools present (including grounded_query)
- Witness manifest valid (Ed25519 verified)

**Do not proceed if validate exits with code 1.** Warnings are acceptable; errors are not.

Run a 5-question smoke test before committing to a full run:
```bash
/gaia run --smoke-only
```

Confirm the cost estimate is within budget before a full run:
```bash
/gaia cost --level=$LEVEL --limit=$LIMIT --models=$MODELS --voting-attempts=$VOTING
```

Confirm the Ed25519 signing key is configured:
```bash
ls plugins/ruflo-core/scripts/witness/
node plugins/ruflo-core/scripts/witness/verify.mjs
```

## Phase 1 — Validate environment

```bash
# Run all pre-flight checks
/gaia validate
```

If any check fails, resolve it before continuing. Pay special attention to:
- `GOOGLE_CUSTOM_SEARCH_CX` — without it, web_search falls back to DuckDuckGo
- `GOOGLE_AI_API_KEY` — without it, grounded_query tool is disabled
- Both keys significantly affect pass-rate (iter 29/30 findings)

## Phase 2 — Estimate cost and confirm

Ask the user for their configuration:
- Level (default: 1)
- Question limit (default: 53 for a quick run, 165 for the full L1 set)
- Models (default: `claude-sonnet-4-6`)
- Self-consistency voting (default: 1; use 3 for L2/L3; note: 3x cost)
- Hardness routing (default: off; recommended on for cost savings)

```bash
/gaia cost --level=$LEVEL --limit=$LIMIT --models=$MODELS --voting-attempts=$VOTING
```

If projected cost > $5, show the estimate and ask: "This run will cost
approximately $X. Proceed? (y/N)"

## Phase 3 — Run the benchmark

```bash
/gaia run --level=$LEVEL --limit=$LIMIT --models=$MODELS --voting-attempts=$VOTING
```

While running, progress is reported every 5 questions:
```
[12/53] 22.7% (5 passed of 22 scored) — est. remaining: $0.18
```

Store the run summary in memory for history tracking:
```bash
npx @claude-flow/cli@latest memory store \
  --namespace gaia-runs \
  --key "run-$(date +%Y%m%d-%H%M)" \
  --value '{"level":$LEVEL,"model":"$MODEL","total":$TOTAL,"passed":$PASSED,"pass_rate":$RATE,"est_cost_usd":$COST}'
```

## Phase 4 — Package for submission

```bash
/gaia submit --results=~/.cache/ruflo/gaia/results-latest.json
```

This produces:
```
submission-<date>-<sha>/
├── results.jsonl        <- HAL-compatible, one JSON per line
├── trajectories.jsonl   <- full agent traces
├── metadata.json        <- harness info, model, tool catalogue
├── manifest.md.json     <- Ed25519-signed witness
└── README.md            <- human summary + leaderboard comparison
```

## Phase 5 — Compare and report

```bash
/gaia leaderboard --level=$LEVEL
/gaia history
```

Interpret the gap between ruflo's score and the leaderboard top-10.
Identify the primary failure mode (tool gap, reasoning miss, extraction bug)
using the `/gaia-debugging` skill if needed.

HAL reference for comparison: 74.6% L1 (300 Q, Sonnet 4.5, open-source at
princeton-pli/hal-harness). ruflo iter 23 baseline: 20.8% L1 (53 Q).

## Phase 6 — Persist learnings

```bash
npx @claude-flow/cli@latest hooks post-task \
  --task-id "gaia-submission-$(date +%Y%m%d)" \
  --success true \
  --train-neural true
```

Store any discovered patterns:
```bash
npx @claude-flow/cli@latest memory store \
  --namespace gaia-patterns \
  --key "submission-notes-$(date +%Y%m%d)" \
  --value "Level $LEVEL, $MODEL: $NOTES"
```

## Extensibility note

This skill is intentionally structured to be benchmark-agnostic. The phase
headers (validate -> estimate -> run -> package -> compare -> learn) apply to
SWE-bench, WebArena, and HumanEval with only phase 3-4 details changing.
