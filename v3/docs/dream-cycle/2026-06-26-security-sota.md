# Security SOTA Report — 2026-06-26

**TL;DR**: MCP tool-call boundaries are the critical unguarded attack surface in 2026 — ShareLock achieves >90% poisoning ASR via threshold schemes while fewer than 1% of agents declare permission contracts; Ruflo's SafeExecutor has no MCP-layer attestation.

## What's New in 2026

| Finding | Source | Confidence |
|---------|--------|------------|
| ShareLock threshold poisoning on MCP tools — >90% ASR via Shamir's scheme distributed across benign-looking servers | arXiv 2026 | A |
| ToolPrivBench: 64.9% over-privilege rate (Qwen3-8B); post-training drops to 27.02% | arXiv / ToolPrivBench benchmark | A |
| Entropy-dynamics jailbreak detection — AUROC 0.941, training-free, peaks at 50–85% layer depth | arXiv 2026 | A |
| Progent prompt-injection defense: 25.8% → 4.2% ASR (6× reduction) on open-weight agents | arXiv 2026 | A |
| Unified intent+harm verification: F1 0.90 → 0.95, residual ASR 4.1% | arXiv 2026 | A |
| PrivacyAlign: GPT-5.5 23.3% leakage, Claude Opus 4.7 34.1%, Gemini 3.1 Pro 41.4% baseline | HuggingFace paper 2026 | B (vendor-aligned claim) |
| TerraProbe: 71.4% of LLM repair suggestions are deceptive (pass shallow, fail deep validation) | arXiv 2026 | A |
| LangSmith gateway guard: configurable PII + timeout policies + sandbox auth proxy (GCP/AWS) | LangChain changelog June 2026 | B |
| <1% of coding agents declare explicit permission boundaries (ControlPlane paper) | arXiv 2026 | A |

## Ruflo Current Capability

| Capability | Status | Location |
|-----------|--------|----------|
| Input validation (Zod-based) | ✅ Implemented | `@claude-flow/security` InputValidator |
| Path traversal prevention | ✅ Implemented | PathValidator |
| Command injection protection | ✅ Implemented | SafeExecutor |
| Password hashing (bcrypt) | ✅ Implemented | PasswordHasher |
| MCP tool-call permission attestation | ❌ Missing | No declared boundary per tool |
| Over-privilege detection at tool dispatch | ❌ Missing | No ToolPrivBench-equivalent |
| Jailbreak detection (entropy layer) | ❌ Missing | No inference-time guard |
| Prompt injection defense (Progent-style) | ❌ Missing | No out-of-band verification |
| Privacy leakage measurement | ❌ Missing | No contextual privacy alignment |

## Competitor Comparison

| Competitor | MCP Security | Prompt Injection Defense | Sandbox / Isolation | Over-Privilege Guard |
|-----------|-------------|------------------------|---------------------|----------------------|
| **LangChain / LangSmith** | Not applicable (custom tool registry) | Gateway guard PII filter (B-grade claim) | Sandbox auth proxy (GCP/AWS/Git) June 2026 | Not published |
| **AutoGen** | No public MCP security posture | Research-stage (no product feature) | Docker isolation (configurable) | No published benchmark |
| **CrewAI** | No public MCP security posture | Not documented | Environment sandboxing | Not published |
| **OpenAI Swarm** | N/A (API-native) | System prompt hardening only | Operator-level isolation | No over-privilege API |
| **Ruflo** | SafeExecutor (no MCP-layer) | None implemented | Agent process isolation | None |

## Benchmarks

| Benchmark | Result | Grade | Source |
|-----------|--------|-------|--------|
| ShareLock MCP poisoning ASR | >90% | A | arXiv 2026 |
| ToolPrivBench OPUR (Qwen3-8B baseline) | 64.9% | A | arXiv ToolPrivBench 2026 |
| ToolPrivBench OPUR post-training | 27.02% | A | arXiv ToolPrivBench 2026 |
| Progent ASR reduction | 25.8% → 4.2% | A | arXiv 2026 |
| Entropy jailbreak AUROC | 0.941 | A | arXiv 2026 |
| Intent+harm F1 (pre/post) | 0.90 → 0.95 | A | arXiv 2026 |
| TerraProbe deceptive-fix rate | 71.4% | A | arXiv 2026 |

All 7 claims are Grade A (reproducible 2026 papers with numeric benchmarks).

## SOTA Proof & Witness

- **Session commit**: 8ae87524553569dcd6ba6a7e7e96fbea6b0e0b74
- **Report SHA-256**: 90fdca347b95cb2331628df553ffc9e620e877f4c2c7d14f4c790af1f4c4756b
- **Witness stamp**: 94640412feecef6ccef028cece6fb8af1abb8d577c12c850fd9f0a979a969cfc
- **Verifier**: `cat dream-gist-2026-06-26.md | sha256sum` → concat with session commit → `sha256sum` → must equal witness stamp

## Scan Findings — Intelligence

**Finding**: Plan representations decay 4.1×–12.4× after a single execution step (Snowflake / HuggingFace 2026). Context eviction reduces task success 56.7% → 22.0% (−34.7 pp). SONA's adaptation loop has no plan-persistence guard — plans stored in short-context memory evict silently.

**Source**: "Plans Don't Persist: Why Context Management Is Load Bearing for LLM Agents" (Snowflake, 2026).  
**Competitive signal**: DeepSeek-R1 partially mitigates via internal re-derivation; early-warning probe detects decay 4.45 steps ahead at 74.2% accuracy.

## Scan Findings — Swarm

**Finding**: SPIN framework reduces multi-agent policy coordination from O(n^m) to O(m·n·χ²) — exponential to linear/polynomial — enabling stable decentralized subgroup formation without central coordinator.

**Source**: arXiv 2606.07557, Fan 2026.  
**Competitive signal**: Hardware-embodied swarms (hexapod locomotion, SIES framework) validating real-time recovery; decentralized scaling is the recognized bottleneck. Ruflo's hierarchical-default topology is suboptimal for large-fleet decentralized scenarios.

## Recommended Next Steps

1. **Implement MCP Tool Permission Attestation** (ADR proposed tonight): Each MCP tool registration must declare a `min-privilege` contract (read/write/execute/network scope); SafeExecutor rejects calls that escalate beyond declared boundary before dispatch. Target: reduce OPUR below 30% (matching ToolPrivBench post-training baseline). File as ADR-[NEXT].

2. **Add Progent-style prompt-injection out-of-band verifier**: Intercept agent tool-call requests and run a secondary lightweight model (Haiku, Tier 2) to verify intent before execution. Benchmark against Progent's 4.2% residual ASR. Estimated token overhead: ~15% per tool call.

3. **Entropy-dynamics jailbreak guard on SONA input boundary**: At the MoE gate (inference time), compute layer-entropy trajectory (Kendall τ) on the routing distribution; flag if monotonicity score exceeds threshold (AUROC 0.941 reference). This is training-free and composable with existing RuVector intelligence pipeline.
