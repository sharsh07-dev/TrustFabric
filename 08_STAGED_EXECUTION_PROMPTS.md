# Staged Execution Prompts — TrustFabric

Use these one at a time if a coding agent cannot reliably execute the full master prompt in a single pass. Keep `07_MASTER_BUILD_PROMPT.md` and the PRD/DRD/TRD as the governing contract.

## Prompt 1 — Inspect, map and plan

Read the repository, `01_SOURCE_REQUIREMENTS_TRACEABILITY.md`, PRD, DRD, TRD, architecture/trust model, acceptance tests, Quartz/AidFlow guidance and demo runbook. Inspect current code and git status without overwriting changes. Make a coverage table for PS42-R01 through PS42-R20 showing existing code, missing code, test evidence, external credentials required, and whether a feature is real or simulated. Read the public TCS Quartz pages; use documented architecture only, not proprietary code. Inspect AidFlow's actual source/tests/license and mark its features versus roadmap. Output a short plan and then wait only if a required credential or irreversible action genuinely blocks you; otherwise start implementation.

## Prompt 2 — Build core working application

Implement grant creation, purpose-bound allocations, financial event ledger, private receipt upload, server-side SHA-256, expense claims, normalized invoice matching, cross-donor duplicate findings, discrepancy rules, application-level release state machine, persistent audit events, donor privacy projection, and core UI. Use the specified stack or the existing working stack. Use real database persistence, not hardcoded screen data. Add migrations, input validation, authorization and tests. A duplicate invoice must trigger a reproducible finding and block the relevant release path. Clearly label this stage's hold as `APP_HOLD` unless a tested contract enforces it. Run build and tests; fix issues.

## Prompt 3 — Add source adapters, delivery proof and adversarial tests

Implement modular chain/bridge/swap/fiat adapter interfaces with provenance, idempotency, finality and incomplete-link statuses. Connect real providers only if API access and test environment exist; otherwise create fixtures that are visibly `SIMULATED`. Add a signed delivery-attestation verifier with canonical payload, registered test key, signature check and replay nonce; add a proof/inclusion mechanism if supported by reviewed libraries. Generate a 100-record test corpus with exactly 30 known forged/altered cases; keep ground-truth labels separate from detection input. Report TP/FP/TN/FN, precision, recall and false-positive rate. Test privacy leakage and forbidden release attempts. Do not represent fixture events as live chain/bank events.

## Prompt 4 — Contract/registry enforcement

Inspect existing AidFlow contracts and tests before reuse. Decide whether a tested Soroban contract can implement purpose-bound allocation, shared expense-nullifier uniqueness, disputed escrow hold, safe release checks and auditable resolution. If it cannot, add a clean, separate contract/adapter design instead of silently bending existing contracts. Use testnet only. The duplicate proof/nullifier conflict must block release in contract logic without a central auditor having to press “hold.” Test both contract and SDK integration with actual contract IDs and RPC. Never put signing secrets in the frontend. If the full privacy-preserving nullifier/ZK proof is not implemented, mark it `PARTIAL` and state the trust limitation.

## Prompt 5 — Design review and UI finishing

Review every screen against `03_DRD.md`. Remove generic generated-dashboard styling: no glowing gradients, excessive round cards, fake charts, decorative AI widgets, meaningless confidence percentages, or fake product/partner logos. Improve data hierarchy, tables, timeline, status semantics, empty/loading/error states, keyboard access and responsive behavior. Make every finding explain its rule and evidence. Confirm that donor-facing API responses do not include sensitive fields.

## Prompt 6 — Final verify and deploy

Run lint, type check, unit tests, integration tests, end-to-end browser tests, contract tests if applicable, and production build. Test persistence after refresh/re-login, duplicate claim hold, forbidden release, private receipt authorization, report mismatch, incomplete multi-hop reconciliation, invalid delivery signature and audit integrity. Prepare `.env.example`, migrations, setup and deployment docs. Deploy only if credentials are available and authorized. Report the actual URL and smoke-test result only if verified. Produce the `PS42-R01..R20` conformance table with exact evidence and statuses `IMPLEMENTED`, `PARTIAL`, `SIMULATED`, `BLOCKED`, or `NOT IMPLEMENTED`.
