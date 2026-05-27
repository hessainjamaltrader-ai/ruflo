---
name: gaia-cost
description: Report cumulative GAIA API spend and project cost for planned configurations
argument-hint: "[--level=1] [--limit=53] [--models=haiku,sonnet] [--voting-attempts=1] [--hardness-routing]"
---

# /gaia cost

Show cumulative API spend across all stored GAIA runs and project the cost
for a planned configuration before you commit to running it.

## Usage

```
/gaia cost
/gaia cost --level=1 --limit=53 --models=claude-sonnet-4-6
/gaia cost --level=1 --limit=300 --models=sonnet,haiku --voting-attempts=3
/gaia cost --level=1 --limit=53 --models=haiku,sonnet --hardness-routing
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--level` | `1` | Level for projection |
| `--limit` | `53` | Number of questions for projection |
| `--models` | `claude-haiku-4-5` | Comma-separated models for projection |
| `--voting-attempts` | `1` | Self-consistency attempts multiplier (Track A, PR #2176; 3x cost) |
| `--hardness-routing` | off | Include hardness-router model-mix estimate (Track Q, PR #2179; ~75% savings on easy Q's) |

## Pricing reference

| Model | Input ($/M tokens) | Output ($/M tokens) |
|-------|--------------------|---------------------|
| claude-haiku-4-5 | $0.25 | $1.25 |
| claude-sonnet-4-6 | $3.00 | $15.00 |
| claude-opus-4-5 | $15.00 | $75.00 |
| Gemini Flash (grounded_query) | Free | Free up to 1500 req/day |

Estimates assume 1,500 input tokens / turn and 512 output tokens / turn,
4.2 mean turns per question (measured baseline).

## Cost multipliers

| Feature | Multiplier | Notes |
|---------|-----------|-------|
| `--voting-attempts=3` | 3x | All questions run 3 attempts; high variance reduction |
| `--hardness-routing` | ~0.25x on easy Q's | Predicted easy questions get Haiku + fewer turns |
| `grounded_query` | $0 | Free Gemini Grounding API; 1500 req/day limit |

## Example output

```
Cumulative spend (all stored runs)
------------------------------------
Total runs:    3
Total Q's:    159
Total spend:  $0.97
  Haiku:      $0.09  (53 Q x 1 attempt)
  Sonnet:     $0.88  (106 Q x 1 attempt)

Projection for: L1, 53 Q, sonnet x 3 voting (--voting-attempts=3)
------------------------------------------------------------------
Questions:        53
Attempts/Q:        3
Effective Q's:   159
Est. input tok:  238,500
Est. output tok:  81,600
Est. cost:        $1.94
Warning: --voting-attempts=3 multiplies cost by 3x

Projection for: L1, 53 Q, haiku+sonnet --hardness-routing
----------------------------------------------------------
Questions:        53
Easy (routed to Haiku, ~8 turns):  ~34 Q  -> $0.07
Hard (routed to Sonnet, 12 turns): ~19 Q  -> $0.41
Est. total:   $0.48  (~75% savings vs all-Sonnet)

  Above $5 threshold: NO — proceed without confirmation
```

## Cost confirmation gate

When a projected run exceeds $5, the `/gaia run` command will display this
cost estimate and require explicit confirmation before proceeding.

## Steps Claude should follow

1. Load history: `npx @claude-flow/cli@latest memory list --namespace gaia-runs`
2. Sum `est_cost_usd` across all stored runs to produce cumulative spend.
3. Compute projection for the requested configuration:
   - `effective_questions = limit x voting-attempts`
   - If `--hardness-routing`: split questions by predicted difficulty;
     easy (~65%) -> Haiku with `turns=max(4, predicted_turns)`,
     hard (~35%) -> selected model with full `max_turns=12`
   - Per question: assume 4.2 turns (measured), 1500 input tokens/turn, 512 output tokens/turn
   - Multiply by model pricing
   - grounded_query calls: $0 (free tier, cap 1500/day)
4. Display the cumulative table and the projection side by side.
5. Flag with a warning banner if projected cost exceeds $5.
