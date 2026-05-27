---
name: gaia-run
description: Execute a GAIA benchmark run — shells out to gaia-bench run, streams progress, and writes JSON results
argument-hint: "[--level=1] [--limit=53] [--models=haiku,sonnet] [--concurrency=3] [--voting-attempts=1] [--hardness-routing] [--planning-interval=4]"
---

# /gaia run

Run GAIA benchmark questions through the ruflo agent loop.

## Usage

```
/gaia run
/gaia run --level=1 --limit=53 --models=claude-sonnet-4-6
/gaia run --level=1 --limit=53 --models=haiku,sonnet --voting-attempts=3 --hardness-routing
/gaia run --smoke-only   # 5 questions, no HF token needed
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--level` | `1` | GAIA difficulty level (1=easiest, 2, 3) |
| `--limit` | all | Maximum questions to run |
| `--models` | `claude-haiku-4-5` | Comma-separated model IDs |
| `--concurrency` | `3` | Parallel question slots |
| `--voting-attempts` | `1` | Self-consistency attempts (Track A, PR #2176; 3 recommended for L2/L3; **warning: 3x cost**) |
| `--hardness-routing` | off | Track Q (PR #2179): route each question to appropriate model/turn budget — **recommended for cost-efficient runs** (~75% cost reduction on easy questions) |
| `--planning-interval` | `4` | Replan every N turns (PR #2183); adds strategic checkpoints to avoid looping on same strategy |
| `--max-turns` | `12` | Max agent turns per question (overridden by hardness router for easy questions; PR #2178) |
| `--judge-model` | `claude-sonnet-4-6` | Model used for LLM-as-judge scoring |
| `--smoke-only` | off | Use 5-question fixture (CI / no HF token) |
| `--output` | `text` | `text` or `json` |

## Recommended configuration for cost-efficient runs

```
/gaia run --level=1 --limit=53 --models=haiku,sonnet --hardness-routing
```

`--hardness-routing` (Track Q, PR #2179) routes easy questions to Haiku with fewer turns,
reserving Sonnet and max turns for hard questions. Reduces ensemble cost by ~75% on easy
questions without sacrificing pass-rate.

Use `--voting-attempts=3` (Track A, PR #2176) for higher-quality answers on L2/L3, but be
aware this multiplies cost by 3x for every question in the run.

`--planning-interval=4` (default, PR #2183) fires a replan checkpoint every 4 turns so
the agent can reassess strategy rather than continuing a failing approach.

## Tool catalogue

The agent has access to these 6 tools (verify with `/gaia validate`):

| Tool | Source | Notes |
|------|--------|-------|
| `web_search` | Google Custom Search (cx) or DuckDuckGo fallback | Primary; requires `GOOGLE_CUSTOM_SEARCH_CX` for best results (PR #2180) |
| `file_read` | Local cache | Reads attachment files from HF dataset |
| `web_browse` | HTTP fetch | Fetches and parses a URL |
| `image_describe` | Gemini Flash | OCR and image understanding |
| `python_exec` | Sandbox | Execute Python snippets |
| `grounded_query` | Gemini Grounding API | Free 1500 req/day; use when `web_search` returns empty results (PR #2181) |

## What this does

1. **Resolve environment keys** — checks `ANTHROPIC_API_KEY`, `HF_TOKEN`, and
   optionally `GOOGLE_*` keys; falls back to GCP Secrets.
2. **Load dataset** — downloads and caches the GAIA validation split from
   Hugging Face (`~/.cache/ruflo/gaia/`).  Cached files are reused on
   subsequent runs.
3. **Estimate cost** — computes expected spend based on model pricing and
   question count; asks for confirmation when estimated cost exceeds $5.
4. **Run the agent loop** — for each question, the multi-turn
   `gaia-agent.ts` loop drives the selected model through up to `--max-turns`
   turns using the registered tool catalogue. A planning checkpoint fires every
   `--planning-interval` turns (default 4) to reassess strategy.
5. **Score results** — two-stage LLM-as-judge (`gaia-judge.ts`) normalizes and
   compares the model's `FINAL_ANSWER` to the ground truth.
6. **Write output** — results land in `~/.cache/ruflo/gaia/results-<sha>.json`.
   Progress is printed to stdout every 5 questions.

## Resuming an interrupted run

If a run crashes, restart with the same flags. The loader checks for a
`checkpoint-<level>-<limit>.json` in the cache dir and skips already-completed
`task_id`s automatically.

## Example invocation (underlying CLI)

```bash
# Standard run
node $(npm root -g)/@claude-flow/cli/bin/cli.js gaia-bench run \
  --level 1 --limit 53 \
  --models claude-sonnet-4-6 \
  --concurrency 3 --voting-attempts 1 \
  --output json

# Cost-efficient run with hardness routing (recommended)
node $(npm root -g)/@claude-flow/cli/bin/cli.js gaia-bench run \
  --level 1 --limit 53 \
  --models haiku,sonnet \
  --hardness-routing \
  --planning-interval 4 \
  --output json
```

## Baselines for context

| System | L1 pass-rate | Notes |
|--------|-------------|-------|
| HAL (Sonnet 4.5) | 74.6% | 300 Q reference run; open-source smolagents (princeton-pli/hal-harness) |
| ruflo iter 23 | 20.8% | 53 Q, web_search restored |
| ruflo iter 15 | 9.4% | 53 Q, broken web_search |

## Steps Claude should follow

1. Check that `ANTHROPIC_API_KEY` and `HF_TOKEN` are set; if not, prompt user
2. Run the cost estimate: `node … gaia-bench run --dry-run --level $LEVEL --limit $LIMIT --models $MODELS`
3. If estimated cost > $5, show the estimate and ask for confirmation
4. Execute: `node … gaia-bench run --level $LEVEL --limit $LIMIT --models $MODELS --concurrency $CONCURRENCY --voting-attempts $VOTING --hardness-routing (if set) --planning-interval 4 --output json`
5. Parse JSON output and display a summary table (model | pass-rate | cost | mean-turns)
6. Store the run record in memory: `npx @claude-flow/cli@latest memory store --namespace gaia-runs --key "run-$(date +%Y%m%d-%H%M)" --value "$SUMMARY"`
