---
name: gaia-architecture-comparison
description: Side-by-side comparison of ruflo vs HAL vs other GAIA harnesses — capability gaps, design decisions, and improvement roadmap
argument-hint: "[--focus=tools|routing|memory|cost]"
allowed-tools: Bash Read mcp__claude-flow__memory_search mcp__claude-flow__memory_store
---

# GAIA Architecture Comparison Skill

Compare ruflo's GAIA benchmark harness against the Princeton HAL reference
implementation and other open-source harnesses to understand capability gaps
and prioritize improvements.

Sources: iter 30 deep research session. All HAL figures are citable to the
princeton-pli/hal-harness repository and the JoyAgent-JDR paper (2025).

## When to use

- Planning the next iteration of GAIA work
- Evaluating which architectural change has the highest pass-rate ROI
- Onboarding a new contributor to the benchmark codebase
- Framing the leaderboard submission story honestly

## Architecture overview

### ruflo harness (current)

```
gaia-bench run
  ├── gaia-loader.ts      — HF dataset download + cache (ADR-133)
  ├── gaia-agent.ts       — multi-turn Anthropic Messages loop
  │    └── gaia-tools/    — web_search (Google CSE primary, PR #2180)
  │                          file_read, web_browse,
  │                          image_describe, python_exec,
  │                          grounded_query (Gemini, PR #2181)
  ├── gaia-voting.ts      — Track A self-consistency (N attempts, PR #2176)
  ├── gaia-hardness/      — Track Q difficulty predictor (ADR-136, PR #2179)
  ├── gaia-planning.ts    — Replan every 4 turns (PR #2183)
  └── gaia-judge.ts       — two-stage LLM-as-judge scorer
```

### HAL reference (Princeton, open-source)

HAL is open-source (smolagents-based) at `princeton-pli/hal-harness`. Its 74.6% L1
score on the GAIA validation set uses Sonnet 4.5 as backbone. Key differences from ruflo:

| Component | HAL implementation |
|-----------|-------------------|
| Agent framework | smolagents CodeAgent (Python-native) |
| Tool interface | OpenAI function calling |
| Web search | Google Search (~16 pp advantage vs Bing per JoyAgent paper) |
| Code execution | Real Python sandbox (not a stub) |
| Browser | BrowserBase / Playwright (JavaScript-rendered pages) |
| Image | GPT-4V or Gemini (functionally equivalent) |
| Self-consistency | None (no voting) |
| Hardness routing | None (single model, fixed turns) |
| Memory | None (stateless per run) |
| Attestation | None |
| max_turns | Up to 200 steps for complex questions |

## Side-by-side: ruflo vs HAL

| Dimension | ruflo | HAL reference | Gap / Advantage |
|-----------|-------|--------------|-----------------|
| Question count | 53 (partial L1) | 300 (full L1) | Use `--limit 165` for full L1 |
| Web search backend | Google CSE (cx) or DDG fallback | Google Search native | ~16 pp per JoyAgent paper if CSE configured |
| Grounded search | grounded_query (Gemini, free 1500/day) | Not in reference | ruflo advantage (PR #2181) |
| Code execution | python_exec (stub) | Real Python sandbox | HAL advantage — high-ROI fix |
| Browser | web_browse (HTTP fetch) | BrowserBase / Playwright | HAL advantage |
| Image OCR | image_describe (Gemini Flash) | GPT-4V / Gemini | Functionally equivalent |
| File handling | file_read (text + images) | Full PDF/XLSX/ZIP | HAL advantage |
| Self-consistency | voting.ts Track A (PR #2176) | None | ruflo advantage |
| Hardness routing | predictor.ts Track Q (PR #2179) | None | ruflo advantage |
| Planning checkpoints | every 4 turns (PR #2183) | None | ruflo advantage |
| Memory | AgentDB HNSW (SONA) | None | ruflo advantage |
| Attestation | Ed25519 witness (ADR-103) | None | ruflo advantage |
| Pass-rate L1 | ~20.8% (iter 23, 53 Q) | 74.6% (300 Q) | ~54 pp gap |

## Ruflo measured differentiators (citable claims)

These are **measured or implemented** advantages, not speculative:

1. **Self-consistency voting** (Track A, PR #2176) — running N attempts per question
   and taking the majority answer. HAL has no equivalent. Expected lift: variance
   reduction on borderline questions (L2/L3 primary target).

2. **Hardness routing** (Track Q, ADR-136, PR #2179) — ADR-132 SimulativePlanningRouter
   passed the -78.2% token reduction acceptance gate. Routes easy questions to Haiku
   with shorter turn budget, reserving Sonnet for hard questions. Reduces cost ~75%
   on easy questions.

3. **Cross-provider grounding** (PR #2181) — `grounded_query` uses Gemini Grounding API
   (free 1500/day) as a factual lookup tool. HAL uses only Google Search. ruflo can
   combine both (Google CSE for broad search + Gemini Grounding for verified facts).

4. **Planning checkpoints every 4 turns** (PR #2183) — the agent replans every 4 turns.
   HAL uses no explicit replanning. Prevents the RP failure mode (same strategy looped).

5. **AgentDB SONA memory** — agent can recall patterns from previous runs via HNSW
   vector search. HAL is stateless per run.

6. **Ed25519 attestation** (ADR-103) — every submission is cryptographically signed.
   HAL has no equivalent. Useful for audits and reproducibility claims.

## Calibrated probability bands (iter 30 research — honest framing)

Iter 30 research found that early projections ran 1.5-2x optimistic. Corrected estimates:

| Outcome | Probability | Conditions |
|---------|------------|-----------|
| Beat HAL (>74.6%) | 10-15% | Requires real python_exec + Playwright browser + full L1 |
| Match top-3 (60-74%) | 30-40% | Requires real python_exec + Google CSE configured |
| Competitive (40-60%) | 40-50% | Current path with real sandbox + full 165 Q |
| Current trajectory | ~25-35% | With real python_exec only (no browser) |

The calibration gap between early projections and measurements was primarily:
- Tool quality (empty web_search calls consumed budget unexpectedly)
- python_exec stub returning errors on ~30% of questions that require computation
- 53/300 question sample skews toward easier questions

## Gap analysis

### Primary gaps (highest pass-rate ROI)

1. **Real code execution** — many L2/L3 questions require running Python to compute
   a numerical answer. The current `python_exec` tool is a stub. Implementing a real
   sandbox (E2B, Pyodide, or subprocess) is the single highest-ROI change. HAL's
   74.6% depends on this working correctly.

2. **Full question set** — running 53/300 L1 questions underestimates true pass-rate
   because the first 53 skew easier. Run `--limit 165` (full L1) for a comparable
   HAL score. Low effort, accurate baseline.

3. **Google Custom Search CX** — configuring `GOOGLE_CUSTOM_SEARCH_CX` enables the
   Google CSE primary backend (PR #2180). JoyAgent paper cites +16 pp for Google vs
   Bing. Without cx, ruflo falls back to DuckDuckGo.

### Secondary gaps (medium impact)

4. **Real browser** — `web_browse` currently fetches raw HTML. Replacing it with
   Playwright/Browserless for JavaScript-rendered pages would unlock web navigation
   questions. HAL uses BrowserBase for this.

5. **Structured file parsing** — PDF, XLSX, and ZIP attachments require dedicated
   parsers. `file_read` currently handles plain text and images only.

6. **System prompt tuning** — HAL's system prompt explicitly instructs the model to
   use tools before answering and provides more elaborate guidance. iter 30 research
   identifies this as a medium-impact lever.

### ruflo advantages to preserve

7. Self-consistency voting (Track A) — keep `--voting-attempts` available
8. Hardness routing (Track Q) — keep `--hardness-routing` as default recommendation
9. grounded_query fallback for empty web_search (PR #2181)
10. AgentDB memory for cross-run pattern storage
11. Ed25519 attestation for reproducible submissions

## Improvement roadmap

| Priority | Change | Expected Lift | Effort | Ref |
|----------|--------|--------------|--------|-----|
| P0 | Real python_exec sandbox (E2B or subprocess) | +15-25 pp | High | iter 30 |
| P0 | Full 165-Q L1 evaluation | Accurate baseline | Low | ADR-133 |
| P0 | Configure GOOGLE_CUSTOM_SEARCH_CX | +5-16 pp (search quality) | Low | PR #2180 |
| P1 | Playwright-based web_browse | +5-10 pp | Medium | — |
| P1 | PDF/XLSX file parser | +3-8 pp | Medium | — |
| P2 | System prompt tuning (HAL-style) | +2-5 pp | Low | iter 30 |
| P2 | Increase max_turns to 20 for L2/L3 | +2-5 pp | Low | PR #2178 |
| P3 | Multi-provider routing (Gemini Flash for cheap Q's) | Cost reduction | Medium | ADR-136 |

## Loading context from past research

```bash
npx @claude-flow/cli@latest memory search \
  --namespace gaia-patterns \
  --query "architecture comparison HAL benchmark iter 30"
```

## Storing comparison findings

```bash
npx @claude-flow/cli@latest memory store \
  --namespace gaia-patterns \
  --key "architecture-comparison-$(date +%Y%m%d)" \
  --value "HAL gap: 54pp. Primary: python_exec stub, full L1, Google CSE. ruflo advantages: voting, hardness-routing, grounded_query, SONA memory, Ed25519."
```
