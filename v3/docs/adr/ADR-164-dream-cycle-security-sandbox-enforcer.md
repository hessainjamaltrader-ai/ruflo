# ADR-164: Execution-Phase Sandbox Enforcer with Transactional Rollback

- **Status:** Proposed
- **Authors:** claude (dream-cycle agent, 2026-06-21)
- **Date:** 2026-06-21
- **Related:** ADR-013 (Core Security Module), ADR-131 (ToolOutputGuardrail / ASI01), Dream Cycle Issue #TBD

---

## Context

The June 2026 security research cycle surfaced three class-A benchmark results demonstrating critical gaps in Ruflo's current security posture:

1. **SafeClawBench** (arXiv:2606.18356, Grade A): 291 of 347 sandbox harms (83.9%) succeed despite passing semantic checks. Ruflo's `ToolOutputGuardrail` is detection-only — it does not enforce an execution-phase sandbox.

2. **FragFuse** (arXiv:2606.15609, Grade B): 86.3% bypass success rate achieved by fragmenting prohibited queries across multiple memory interactions. `ToolOutputGuardrail` operates per-call with no cross-interaction session state.

3. **Cordon** (arXiv:2606.17573, Grade B): Task-scoped transactional boundaries expose cross-step violations that per-call guardrails miss, enabling rollback of multi-step tool chains on policy violation. Ruflo has no equivalent primitive.

Existing coverage (ADR-013, ADR-131): input validation at HTTP/CLI boundaries, allowlist-gated `SafeExecutor`, per-call tool-output scanning, plugin integrity verification, claims-based authorization propagation. These primitives are insufficient against composition-phase and memory-fragmentation vectors.

OWASP ASI 2026 formalises this gap: ASI01 (Agent Goal Hijacking), ASI05 (Unexpected Code Execution), ASI06 (Memory & Context Poisoning), and ASI08 (Cascading Agent Failures) all require execution-phase controls, not detection-only.

---

## Decision

Add a `SandboxEnforcer` class to `@claude-flow/security` implementing:

1. **Task-scoped transaction context**: wrap multi-step tool chains in a `SandboxTransaction`. On `commit()` (all steps clean) or `rollback()` (policy violation) the transaction disposes its resource registry.

2. **Execution-phase enforcement gate**: before `SafeExecutor.run()` is called, `SandboxEnforcer.admit()` checks the pending command against the current transaction's claim set. Reject = throw `SandboxViolation`; the caller's `try/rollback` handler reverts all mutations.

3. **Cross-interaction memory fragment tracker**: extend `ToolOutputGuardrail.scanAndEnforce()` to accept an optional `SessionFragmentStore`. Across calls within a session, the store accumulates fragment fingerprints; if a set of fragments matches a composite injection pattern, a `medium` or `high` severity finding is emitted.

4. **CmdNeedle equivalence-class auditor**: a `SafeExecutor` configuration validator that, on startup, walks the allowlist entries and flags any pair `(a, b)` where `b` is a known shell-equivalent of `a` but is not explicitly listed (e.g., `/bin/sh` ↔ `sh` ↔ `dash`). Emits warnings; does not hard-fail startup.

---

## Consequences

**Benefits:**
- Targets measurable reduction in ASR: Aura Mobile (arXiv:2602.10915, Grade A) achieved 40% → 4.4% with semantic firewall + privilege isolation; Cordon-style rollback adds a second enforcement layer.
- Closes OWASP ASI05, ASI06, ASI08 gaps without breaking the existing `ToolOutputGuardrail` or `SafeExecutor` callsites (additive, opt-in).
- Fragment tracker adds zero async I/O — compatible with the <1ms p99 `scanAndEnforce` target.

**Costs / Risks:**
- `SandboxTransaction` requires callers to adopt a `try/rollback` idiom; existing agent loops need opt-in migration.
- Fragment fingerprinting increases per-call memory by O(session_length × pattern_count); cap via `maxFragmentHistory` config.
- CmdNeedle equivalence mapping must be maintained as new shell primitives emerge.

**Not Addressed Here (future ADRs):**
- Certificate-bound authority (Sovereign Execution Brokers, arXiv:2606.20520) — requires PKI integration.
- Skill-composition attack prevention (arXiv:2606.15242) — requires plugin execution DAG analysis.

---

## Implementation Notes

```typescript
// @claude-flow/security/src/sandbox-enforcer.ts (new file, <200 lines)

export interface SandboxTransaction {
  id: string;
  claimSet: ReadonlySet<string>;
  admit(command: string, args: string[]): void;   // throws SandboxViolation
  commit(): void;
  rollback(): void;
}

export class SandboxEnforcer {
  beginTransaction(claimSet: string[]): SandboxTransaction { ... }
  // integrates with SafeExecutor via admit() check before every run()
}

export class SandboxViolation extends Error {
  constructor(public readonly command: string, public readonly reason: string) { ... }
}
```

Fragment tracker extension to `ToolOutputGuardrail` (same file, ~40 lines): accepts `SessionFragmentStore` as optional constructor arg; when provided, `scanAndEnforce` also runs `store.accumulate(content)` and checks composite patterns.

---

## References

- arXiv:2606.18356 — SafeClawBench (Grade A, open benchmark)
- arXiv:2602.10915 — Aura Mobile (Grade A, MobileSafetyBench)
- arXiv:2601.07853 — FinVault (Grade A, 963 test cases)
- arXiv:2606.17573 — Cordon (Grade B, transactional boundary prototype)
- arXiv:2606.15609 — FragFuse (Grade B, memory fragmentation)
- arXiv:2606.15549 — CmdNeedle (Grade B, denylist corpus)
- OWASP Top 10 for Agentic Applications 2026 (ASI01–ASI10)
