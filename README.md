# TrustFabric — CASCADE '26 PS 4.2 Complete Prompt & Specification Pack

**Problem statement:** Theme 4, Problem 4.2 — *The Black Hole Ledger: Verifiable NGO Fund Flows*  
**Product concept:** TrustFabric — an NGO-specific, evidence-verification and fund-reconciliation application that can complement enterprise DLT infrastructure.  
**Purpose:** Give a coding agent enough traceable requirements, design direction, technical architecture, test scenarios, and staged prompts to implement the project rather than merely describe it.

## What's inside

1. `01_SOURCE_REQUIREMENTS_TRACEABILITY.md` — source requirements translated into testable requirements. This is the coverage checklist.
2. `02_PRD.md` — product requirements, users, flows, scope, and acceptance criteria.
3. `03_DRD.md` — human-designed interface direction, interaction design, accessibility, and screen specifications.
4. `04_TRD.md` — implementation stack, modules, data model, APIs, security and integration requirements.
5. `05_ARCHITECTURE_AND_TRUST_MODEL.md` — data flow, on-chain/off-chain boundaries, chain/fiat reconciliation, privacy and decentralization assumptions.
6. `06_ACCEPTANCE_AND_RED_TEAM_TESTS.md` — functional, adversarial, security, privacy and reliability tests.
7. `07_MASTER_BUILD_PROMPT.md` — primary coding-agent prompt. Start here.
8. `08_STAGED_EXECUTION_PROMPTS.md` — prompts for plan, implementation, hardening and deployment if the agent needs smaller phases.
9. `09_QUARTZ_AND_AIDFLOW_GUIDANCE.md` — how to use public TCS Quartz architectural principles and keep AidFlow optional.
10. `10_DEMO_RUNBOOK.md` — reproducible one-admin demonstration.
11. `11_24H_SCOPE_AND_PRODUCTION_GAPS.md` — what a 24-hour pilot can prove and what needs further work before real financial use.

## How to use the pack

1. Put this folder in the repository, typically as `/docs/TrustFabric_PS42_Complete_Prompt_Pack/`.
2. Open the existing project in Cursor, Claude Code, Codex or another coding agent with terminal access.
3. Give the agent the full text of `07_MASTER_BUILD_PROMPT.md`. It references the other documents as requirements that must be read and followed.
4. If context limits require phasing, use `08_STAGED_EXECUTION_PROMPTS.md` in sequence.
5. Require the agent to run the tests and record actual results. Do not accept claims such as “deployed,” “all tests pass,” “on-chain,” “verified,” or “production-ready” unless evidenced.

## Important truth-in-labeling

This pack specifies complete **problem-statement coverage**. It does not make a one-day implementation automatically production-safe. Full PS coverage includes multi-chain event adapters, off-chain fiat reconciliation, privacy-preserving duplicate detection, evidence verification, and a decentralized disbursement hold mechanism. A 24-hour build can deliver a credible pilot/demo and a clearly defined adapter architecture, but real production coverage depends on working integrations, suitable cryptographic implementations, contract verification, independent security review, and real-source testing.

The application must distinguish at least these statuses:

- `ON_CHAIN_VERIFIED` — confirmed using a supported chain adapter and finality policy.
- `SOURCE_ATTESTED` — a trusted source/provider signed or attested the record, and signature checks passed.
- `EVIDENCE_LINKED` — a document is linked to a claim; this alone does not establish authenticity.
- `RULES_CHECKED` — configured deterministic checks ran successfully.
- `NEEDS_REVIEW` — a potential issue requires investigation.
- `SIMULATED` — generated demo data or a mock adapter; never present as live chain or bank data.
- `UNVERIFIED` — evidence or source could not be independently verified.

## Official problem source

The source is `CASCADE26_Problem_Statements_Reflowed.pdf`, Theme 4, Problem 2, page 13. The scope is transcribed and mapped in `01_SOURCE_REQUIREMENTS_TRACEABILITY.md`.

## Public architectural references

- TCS Quartz overview: https://www.tcs.com/what-we-do/products-platforms/quartz
- Quartz Smart Solutions: https://www.tcs.com/what-we-do/products-platforms/quartz/solution/quartz-smart-solutions-dlt-friendly-ready-to-use
- Quartz Gateway: https://www.tcs.com/what-we-do/products-platforms/quartz/solution/quartz-gateway-command-center-reinvent-business-roadmap
- Quartz DevKit: https://www.tcs.com/what-we-do/products-platforms/quartz/solution/quartz-devkit-blockchain-app-development-kit
- AidFlow upstream repository: https://github.com/Aid-flow/Aidflow

Quartz is a public architectural reference, not an available source-code dependency. AidFlow is an optional integration candidate, not the fraud verification product itself.

---

## Quick Start & Verification

### 1. Install & Build
```bash
npm run build
```

### 2. Run Test Suite (Vitest)
```bash
npm test
```
All 24 automated unit and integration tests across 8 test suites pass, verifying `PS42-R01` through `PS42-R20`:
- `crypto.test.ts`: SHA-256 digests, tamper evidence, canonicalization v1.0, nullifiers, Ed25519 signatures, Merkle roots.
- `grantPolicy.test.ts`: Purpose-bound allocation, over-allocation rejection, category violation rejection.
- `duplicateEngine.test.ts`: Exact byte collision, normalized claim tuple collision, atomic nullifier registry conflict.
- `escrowStateMachine.test.ts`: Automated non-auditor hold state machine, release rejection while held, claimant unilateral unfreeze denial.
- `discrepancyEngine.test.ts`: 8 explainable rules (unexplained transfers, overspend, report discrepancies, bridge gaps).
- `lineageEngine.test.ts`: Multi-hop fund flow from ETH donation to bank clearing and delivery.
- `auditLedger.test.ts`: Cryptographic tamper-evident hash chaining and broken link detection.
- `donorPortal.test.ts`: Scoped donor access control and strict beneficiary PII protection.
- `redTeam.test.ts`: 100-record synthetic corpus with 30% forged mutations, blind scoring, and confusion matrix.

### 3. Launch Development Server
```bash
npm run dev
```
Navigate to `http://localhost:3000/` to explore the enterprise financial workspace.

