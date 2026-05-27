---
name: gaia-debugging
description: Diagnose why a GAIA question failed — extract trace, classify failure mode, and propose a fix
argument-hint: "<task_id> [--results=<path>]"
allowed-tools: Bash Read mcp__claude-flow__memory_search mcp__claude-flow__memory_store mcp__claude-flow__agentdb_pattern_search mcp__claude-flow__agentdb_pattern_store
---

# GAIA Debugging Skill

When a GAIA question fails, systematically diagnose the root cause and propose
a targeted fix.

## When to use

- A specific `task_id` returns the wrong answer or times out
- Pass-rate dropped between two runs and you need to find the regression
- You want to understand why a particular question class is consistently failing

## Key insight from iter 29: tool quality is the bottleneck

**Before raising max_turns or adding turns budget, check tool result quality first.**

Iter 29 finding: the primary cause of turn exhaustion was empty `web_search` results.
The agent was not "thinking slowly" — it was calling the same tool repeatedly because
the first call returned nothing useful. Extra turns burned on null results don't help.

Diagnostic priority order:
1. Check if tool calls returned non-empty results
2. Check if the agent was looping on the same tool call
3. Only if results were non-empty but wrong — consider reasoning or extraction issues
4. Only as a last resort — increase max_turns

## Failure mode taxonomy

| Code | Mode | Symptom | Fix direction |
|------|------|---------|--------------|
| TG | Tool Gap | Agent lacks a required tool (no image OCR, no PDF reader) | Add tool to catalogue |
| RM | Reasoning Miss | Agent has the right data but draws wrong conclusion | Improve system prompt, add CoT instruction |
| EB | Extraction Bug | Answer is in the trace but `FINAL_ANSWER:` regex fails | Fix answer extraction pattern |
| LI | Loop Issue | Agent loops (re-asks same tool call) and hits turn limit | Add loop-detection; check tool quality first |
| DS | Dataset Shift | Ground truth differs from what web currently shows | Flag for HAL dataset audit |
| AT | API Timeout | Tool call times out; agent never gets the result | Increase per-turn timeout |
| ET | Empty Tool | web_search returns empty / null results, agent burns turns | Switch to grounded_query; verify GOOGLE_CUSTOM_SEARCH_CX |
| RP | Replan Stall | Planning checkpoint shows same strategy each time | Check planning-interval; manually suggest strategy switch |

## Failure modes from iter 29 and iter 30

### ET — Empty tool results (iter 29 finding)

**Symptom**: Trajectory shows multiple `web_search` calls with empty or near-empty
responses. The agent may ask the same or similar query 3-5 times before exhausting turns.

**How to detect**:
```bash
node -e "
  const r = JSON.parse(require('fs').readFileSync(process.env.RESULTS));
  const q = r.results.find(x => x.task_id === process.env.TASK_ID);
  const empties = q.trajectory.filter(t =>
    t.tool === 'web_search' && (!t.result || t.result.trim().length < 100)
  );
  console.log('Empty web_search calls:', empties.length, '/', q.trajectory.filter(t => t.tool === 'web_search').length);
"
```

**Fix**: Try `grounded_query` instead of `web_search` for the same query. grounded_query
uses Gemini Grounding (free 1500/day, PR #2181) and returns more reliable factual results.
Also verify `GOOGLE_CUSTOM_SEARCH_CX` is set (PR #2180 — without it, search falls back to
DuckDuckGo which has lower quality for factual lookups).

### TB — Turn budget exhausted with no answer (iter 22 + iter 29 finding)

**Symptom**: `max_turns` reached, no `FINAL_ANSWER` in trace. May appear as LI
(loop issue) but the root cause is usually ET (empty tool results) or AT (timeout).

**Diagnostic order** (from iter 29 evidence):
1. Count non-empty tool results in the trajectory
2. If >50% of tool calls returned empty/null — this is ET, not a turns problem
3. If tool calls returned data but agent did not answer — check for EB or RM
4. If tool calls succeeded and reasoning looks correct — consider raising max_turns

**Do NOT increase max_turns as first response.** Iter 29 showed that empty web_search
calls consumed the entire turn budget; doubling turns just doubled the wasted calls.

### RP — Replan checkpoints showing same strategy (iter 34 mechanism)

**Symptom**: In the trajectory, every planning checkpoint (every 4 turns by default,
PR #2183) produces the same plan as the previous one. The agent commits to an approach
(e.g., "search Wikipedia for X") and re-commits to it after each replan.

**How to detect**: Look for repeated high-level plan strings in planning-step trace lines.

**Fix**: This typically means the agent's search approach is failing silently. Two options:
1. Manually suggest a different tool for the question type (e.g., use `grounded_query`
   instead of `web_search`; use `python_exec` for numerical questions)
2. If re-running, add a system prompt note for this question class: "If your first
   search attempt fails, switch to a different tool or rephrase the query significantly"

## Diagnostic workflow

### Step 1 — Load the question trace

```bash
# Find the result for the task_id in the latest run
RESULTS=~/.cache/ruflo/gaia/results-latest.json
node -e "
  const r = JSON.parse(require('fs').readFileSync('$RESULTS'));
  const q = r.results.find(x => x.task_id === '$TASK_ID');
  console.log(JSON.stringify(q, null, 2));
"
```

### Step 2 — Check tool result quality first (iter 29 protocol)

```bash
# Count empty vs non-empty tool results
node -e "
  const r = JSON.parse(require('fs').readFileSync('$RESULTS'));
  const q = r.results.find(x => x.task_id === '$TASK_ID');
  const calls = q.trajectory || [];
  const empty = calls.filter(t => !t.result || t.result.trim().length < 50).length;
  const total = calls.filter(t => t.tool).length;
  console.log('Tool calls:', total, '| Empty/null results:', empty);
  if (empty / total > 0.5) {
    console.log('DIAGNOSIS: ET — empty tool results. Fix: try grounded_query, verify CX.');
  }
"
```

### Step 3 — Classify the failure

Look at the trace output:

1. **No tools called at all** — RM or configuration issue
2. **Tool called but returned error** — TG or AT
3. **Tool returned empty / near-empty results** — ET (check GOOGLE_CUSTOM_SEARCH_CX + grounded_query)
4. **Tool returned data, wrong answer** — RM or EB
5. **Correct answer in trace but marked wrong** — EB
6. **max-turns hit with mostly empty tool results** — ET first (not LI)
7. **max-turns hit with data-bearing tool results** — LI or RM
8. **Same planning step repeated** — RP

### Step 4 — Re-run with extended logging

```bash
node v3/@claude-flow/cli/bin/cli.js gaia-bench run \
  --level 1 --limit 1 \
  --task-id $TASK_ID \
  --models claude-sonnet-4-6 \
  --max-turns 20 \
  --output json
```

### Step 5 — Apply targeted fix

| Failure | Action |
|---------|--------|
| ET — empty web_search | Verify `GOOGLE_CUSTOM_SEARCH_CX`; try `grounded_query` for same query |
| TG — missing web_browse | Verify `gaia-tools/index.ts` exports `web_browse`; check tool registration |
| TG — missing image OCR | Add `image_describe` tool call; verify `GOOGLE_AI_API_KEY` |
| RM — reasoning | Add a system prompt instruction: "Before answering, list all facts you have gathered" |
| EB — extraction | Test the `FINAL_ANSWER_RE` regex against the trace manually |
| LI — loop | Add a tool-call deduplication guard in `gaia-agent.ts` |
| AT — timeout | Set `DEFAULT_PER_TURN_TIMEOUT_MS` higher or use `--max-turns` flag |
| RP — replan stall | Switch tool or rephrase query; override strategy for this question class |

### Step 6 — Verify fix and store pattern

```bash
# Re-run the single question
node ... gaia-bench run --task-id $TASK_ID --models $MODEL --output json

# If now passing, store the pattern
npx @claude-flow/cli@latest memory store \
  --namespace gaia-debug-patterns \
  --key "fix-$FAILURE_CODE-$(date +%Y%m%d)" \
  --value "task_id=$TASK_ID, mode=$FAILURE_CODE, fix=$FIX_DESCRIPTION"
```

## Quick reference: tool catalogue check

```bash
node -e "
  const { createDefaultToolCatalogue } = require('./v3/@claude-flow/cli/src/benchmarks/gaia-tools/index.js');
  const cat = createDefaultToolCatalogue({});
  console.log('Tools registered:', cat.definitions.map(t => t.name));
"
```

Expected (6 tools): `web_search`, `file_read`, `web_browse`, `image_describe`, `python_exec`, `grounded_query`

If `grounded_query` is missing, set `GOOGLE_AI_API_KEY` and run `/gaia validate`.

## Pattern storage

After resolving a debugging session, store the finding:
```bash
npx @claude-flow/cli@latest memory store \
  --namespace gaia-debug-patterns \
  --key "session-$(date +%Y%m%d-%H%M)" \
  --value '{"task_id":"$TASK_ID","failure_mode":"$CODE","fix":"$FIX","verified":true}'
```

Search for similar past failures:
```bash
npx @claude-flow/cli@latest memory search \
  --namespace gaia-debug-patterns \
  --query "extraction bug final answer regex"

npx @claude-flow/cli@latest memory search \
  --namespace gaia-debug-patterns \
  --query "empty web_search grounded_query"
```
