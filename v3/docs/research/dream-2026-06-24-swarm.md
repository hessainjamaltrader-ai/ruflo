# Swarm SOTA Report — 2026-06-24

**TL;DR:** Six peer-reviewed 2026 papers reveal that trust-weighted consensus and decentralised topologies now enable 990-agent swarms with ≤5.3 % degradation under adversarial removal; Ruflo's current raft-only consensus has no trust layer — ADR-167 proposes adding one.

---

## What's New in 2026

| Finding | Source | Confidence |
|---------|--------|------------|
| SGTO-MAS: Bayesian trust scoring integrated into consensus maintains 0.8764 consensus level; only 2.5 % degradation under agent removal, 5.3 % under consensus disruption | arXiv:2606.07940 (Jun 2026) | A |
| SWARM+: Decentralised hierarchical consensus with distributed ledger-state coordination scales to 990 agents | arXiv:2603.19431 (Mar 2026) | A |
| Orchestra-o1: Modality-aware task decomposition with parallel sub-agent specialisation achieves +10.3 % on OmniGAIA vs next best | arXiv:2606.13707 (Jun 2026) | A |
| RAPS: Reputation-Aware Publish-Subscribe uses Bayesian reputation to detect malicious peers; tested on 5 benchmarks | arXiv:2602.08009 (Feb 2026) | A |
| Theater of Mind: entropy-based intrinsic drive mechanism auto-breaks reasoning deadlocks in event-driven swarms | arXiv:2604.08206 (Apr 2026) | A |
| RL for LLM-MAS: 8 reward families + 5 orchestration sub-decisions (spawn, delegate, aggregate) formalised for production swarms | arXiv:2605.02801 (May 2026) | A |
| Weaviate Engram GA (June 2026): managed memory-as-a-service targeting agentic apps; MCP Server in v1.37 for agent tool access | weaviate.io/blog | C |
| Milvus Loon storage engine (June 2026): column-group layout claims 10× faster on managed Zilliz Cloud vs self-hosted | milvus.io/blog | B |

---

## Ruflo Current Capability

| Capability | Status | Notes |
|------------|--------|-------|
| Swarm topologies | ✅ hierarchical, mesh, adaptive | 5 topologies in CLAUDE.md |
| Consensus mechanisms | ✅ raft, byzantine (BFT), gossip, CRDT, quorum | Per CLAUDE.md |
| Trust / reputation layer | ❌ absent | No per-agent trust scoring in any consensus path |
| Max recommended agents | 6–8 | Anti-drift default; far below SWARM+ 990 |
| Fault-tolerance signal | ❌ none | No degradation metrics collected at runtime |
| Event-driven deadlock breaking | ❌ none | Theater-of-Mind entropy mechanism not present |
| MCP-native vector store | ❌ none | ruvector internal only; no Weaviate/Qdrant MCP bridge |

---

## Competitor Comparison

| Framework | Latest Public Release | Swarm Scale | Trust/Reputation | Memory Integration | Benchmark |
|-----------|----------------------|-------------|------------------|--------------------|-----------|
| **LangGraph** | 1.2.6 (Jun 2024) | Small graph flows | None | LangMem (beta) | None public |
| **AutoGen** | 0.7.5 (Sep 2024) | Nested team hierarchies | None | Redis + Mem0 | None public |
| **CrewAI** | 1.14.7 (Jun 2024) | Pluggable crew pipelines | None | RAG + knowledge backends | None public |
| **OpenAI Swarm** | Experimental (deprecated) | Lightweight handoffs | None | Stateless by design | Educational only |
| **Ruflo** | 3.6.10 (stable) | 6–8 anti-drift default | ❌ missing | AgentDB HNSW hybrid | ~1.9×–4.7× HNSW speedup |
| **SGTO-MAS (paper)** | arXiv 2026 | Trust-gated consensus | ✅ Bayesian | Shared vector state | 0.8764 consensus, 2.5 % drop |

---

## Benchmarks

| Benchmark | Value | Grade | Source |
|-----------|-------|-------|--------|
| SGTO-MAS consensus level under adversarial removal | 0.8764 (2.5 % drop vs baseline) | A | arXiv:2606.07940 |
| SGTO-MAS consensus disruption degradation | 5.3 % | A | arXiv:2606.07940 |
| SWARM+ agent scale | 990 distributed agents | A | arXiv:2603.19431 |
| Orchestra-o1 OmniGAIA accuracy gain | +10.3 % over second-best | A | arXiv:2606.13707 |
| Milvus Loon storage speed | 10× faster (managed vs self-hosted) | B | milvus.io/blog |
| Weaviate Engram latency | "very low" (async design; unquantified) | C | weaviate.io/blog |
| Qdrant 1.18 TurboQuant | No benchmark published | C | qdrant.tech/blog |
| LangGraph / AutoGen / CrewAI 2026 benchmarks | No 2026 data available | — | GitHub releases |

---

## SOTA Proof & Witness

- **Session commit:** `79b8634bd1375de4afd60e5f40067b41febc1beb`
- **Report SHA-256:** `d67a3d099bfcaa889a3d0a4f79f6f746e49ff4ee2176592a2ab0b1c14694e198`
- **Witness stamp:** `82d143e9d0fc9142192005b00f70d45903039ba1b18b93678761da8e0f311742`
- **Verifier:** `printf '%s%s' "$(sha256sum dream-gist-2026-06-24.md | awk '{print $1}')" "79b8634bd1375de4afd60e5f40067b41febc1beb" | sha256sum` → must equal `82d143e9d0fc9142192005b00f70d45903039ba1b18b93678761da8e0f311742`

---

## Recommended Next Steps

1. **Implement trust-weighted consensus (ADR-167):** Add a `trust_score` field to each agent's heartbeat in `hierarchical-coordinator`. Weight raft votes by trust score (Bayesian update: `trust_new = trust_old * (1 - α) + outcome * α`, α = 0.1). Expected: match SGTO-MAS 0.8764 consensus retention under adversarial conditions. Estimated: 2 days, zero new dependencies.

2. **Raise anti-drift default ceiling to 32 agents with decentralised sharding:** SWARM+ (arXiv:2603.19431) shows 990-agent scale is achievable with hierarchical ledger-state coordination. Ruflo's 6–8 ceiling is a config guard, not an architectural limit. Add `--shard-count N` flag to `swarm init` that partitions the agent pool into sub-swarms of 8, each with local raft, and a global quorum across shard leaders. Estimated: 3 days.

3. **Bridge ruvector to Weaviate Engram via MCP (ruvector-integration):** Weaviate 1.37 ships an MCP Server (`mcp__weaviate__*`). Map Ruflo's `memory_search_unified` to route to Weaviate Engram when namespace is `long-term`, falling back to AgentDB for `session` and `pattern` namespaces. This directly addresses the missing MCP-native vector store gap. Estimated: 1 day.
