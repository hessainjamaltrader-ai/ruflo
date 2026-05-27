---
name: gaia-validate
description: Pre-submit validation — TypeScript clean, dataset accessible, all required env keys present
argument-hint: "[--strict] [--fix]"
---

# /gaia validate

Run pre-submission integrity checks before executing a benchmark or packaging
results for the HAL leaderboard.

## Usage

```
/gaia validate
/gaia validate --strict
/gaia validate --fix
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--strict` | off | Fail on warnings (not just errors) |
| `--fix` | off | Attempt to auto-fix resolvable issues (e.g., install missing deps) |
| `--skip-hf` | off | Skip the HF dataset connectivity check (useful offline) |
| `--skip-build` | off | Skip the TypeScript build check |

## Checks performed

### 1. Environment keys
- `ANTHROPIC_API_KEY` — required for model inference
- `HF_TOKEN` — required to download the GAIA dataset from Hugging Face
- `GOOGLE_AI_API_KEY` — required for `grounded_query` tool (Gemini Grounding API,
  PR #2181); warn if absent (grounded_query tool disabled — this is the primary
  fallback when `web_search` returns empty results)
- `GOOGLE_CUSTOM_SEARCH_API_KEY` — optional; warn if absent (web_search falls back
  to DuckDuckGo)
- `GOOGLE_CUSTOM_SEARCH_CX` — optional but **strongly recommended**; without it,
  `web_search` cannot use Google Custom Search Engine as primary backend (PR #2180).
  If absent, warn: "Set up a CSE at programmablesearchengine.google.com and set
  GOOGLE_CUSTOM_SEARCH_CX to enable Google Search (16 pp improvement over Bing
  observed in JoyAgent paper)."

### 2. TypeScript build
```bash
cd v3/@claude-flow/cli && npx tsc --noEmit
```
All GAIA benchmark source files must be TS-error-free.

### 3. Dataset accessibility
Perform a dry-run fetch of 1 question from the HF GAIA dataset to confirm
the token and network path work.

### 4. Witness manifest
Verify the witness manifest is up to date and valid:
```bash
node plugins/ruflo-core/scripts/witness/verify.mjs
```

### 5. Benchmark source files present
Confirm all required benchmark source files exist:
- `v3/@claude-flow/cli/src/commands/gaia-bench.ts`
- `v3/@claude-flow/cli/src/benchmarks/gaia-agent.ts`
- `v3/@claude-flow/cli/src/benchmarks/gaia-judge.ts`
- `v3/@claude-flow/cli/src/benchmarks/gaia-loader.ts`
- `v3/@claude-flow/cli/src/benchmarks/gaia-tools/index.ts`

### 6. max_turns configuration (PR #2178)
Confirm the active `DEFAULT_MAX_TURNS` is 12 (not 8):
```bash
grep -E 'DEFAULT_MAX_TURNS|defaultMaxTurns' \
  v3/@claude-flow/cli/src/benchmarks/gaia-agent.ts \
  v3/@claude-flow/cli/src/commands/gaia-bench.ts
```
Both should show `12`. If either shows `8`, the fix from PR #2178 was not applied.
Output `[PASS] max_turns default = 12` or `[FAIL] max_turns = 8 — apply fix/gaia-bench-max-turns-default-12`.

### 7. Tool catalogue completeness (6 tools)
Confirm all 6 tools are registered:
```bash
node -e "
  const { createDefaultToolCatalogue } = require('./v3/@claude-flow/cli/src/benchmarks/gaia-tools/index.js');
  const cat = createDefaultToolCatalogue({});
  const names = cat.definitions.map(t => t.name).sort();
  console.log('Tools:', JSON.stringify(names));
"
```
Expected: `grounded_query`, `file_read`, `image_describe`, `python_exec`, `web_browse`, `web_search` (6 tools).
If `grounded_query` is missing, warn: "grounded_query requires GOOGLE_AI_API_KEY (PR #2181)".

### 8. CLI binary resolvable
```bash
node v3/@claude-flow/cli/bin/cli.js --version
```

## Expected output

```
Validating GAIA benchmark environment...

[PASS] ANTHROPIC_API_KEY set (sk-ant-...abc3)
[PASS] HF_TOKEN set (hf_...xyz9)
[WARN] GOOGLE_AI_API_KEY not set — grounded_query tool disabled (set up at ai.google.dev)
[WARN] GOOGLE_CUSTOM_SEARCH_CX not set — web_search using DuckDuckGo fallback
       Setup: programmablesearchengine.google.com (+16 pp vs Bing per JoyAgent paper)
[PASS] TypeScript build clean (0 errors)
[PASS] HF dataset reachable (1 question fetched)
[PASS] Witness manifest valid (Ed25519 verified)
[PASS] All 5 benchmark source files present
[PASS] max_turns default = 12 (PR #2178 applied)
[PASS] Tool catalogue: 6 tools (web_search, file_read, web_browse, image_describe, python_exec, grounded_query)
[PASS] CLI binary resolves to v3.6.x

2 warnings (use --strict to fail on warnings)
Ready to run /gaia run
```

## Steps Claude should follow

1. For each env var, check `process.env` first, then attempt
   `gcloud secrets versions access latest --secret=<name>` silently.
2. Run `npx tsc --noEmit` in the CLI package directory; capture stderr.
3. Run a 1-question dry-run fetch: `node … gaia-bench run --smoke-only --limit=1 --dry-run`.
4. Run the witness verify script.
5. Grep for `DEFAULT_MAX_TURNS` in gaia-agent.ts and gaia-bench.ts; confirm both are 12.
6. Attempt to load the tool catalogue and verify 6 tools are present.
7. Print the validation table and exit with code 1 if any errors (not warnings)
   are found, unless `--strict` is set in which case warnings also cause exit 1.
