# MASTER BUILD PROMPT — TrustFabric for CASCADE '26 PS 4.2

> Paste this entire document into Cursor, Claude Code, Codex, or another coding agent that can inspect the repository and execute terminal commands. Keep the other documents in this pack available in the project. This is an implementation prompt, not a guarantee that the agent or a 24-hour effort will reach production readiness.

---

## ROLE AND MISSION

Act as a principal full-stack engineer, distributed-systems architect, smart-contract engineer, financial reconciliation specialist, applied cryptography engineer, security reviewer, and product designer.

**Build TrustFabric as a working, executable, deployable pilot that covers the complete requirements of CASCADE '26 Theme 4 Problem 4.2, “The Black Hole Ledger: Verifiable NGO Fund Flows.”** Do not stop at planning, wireframes, static dashboards, placeholder endpoints, or a code scaffold. Inspect the current repo, implement, run, test, fix, and document what is genuinely working.

The application is an independent NGO-specific verification product that may complement enterprise DLT platforms. It is not a clone of TCS Quartz and must not claim to contain TCS proprietary code or undocumented internals.

## REQUIRED FIRST ACTIONS

1. Inspect the current repository, package manifests, existing application, tests, environment configuration, and git status. Preserve useful work and do not overwrite user changes.
2. Read all files in this pack, especially:
   - `01_SOURCE_REQUIREMENTS_TRACEABILITY.md`
   - `02_PRD.md`
   - `03_DRD.md`
   - `04_TRD.md`
   - `05_ARCHITECTURE_AND_TRUST_MODEL.md`
   - `06_ACCEPTANCE_AND_RED_TEAM_TESTS.md`
   - `09_QUARTZ_AND_AIDFLOW_GUIDANCE.md`
   - `10_DEMO_RUNBOOK.md`
   - `11_24H_SCOPE_AND_PRODUCTION_GAPS.md`
3. Read the official CASCADE problem source if it exists in the workspace. Treat the source wording as authoritative; do not silently substitute a generic donation app.
4. Read these current public TCS Quartz references:
   - https://www.tcs.com/what-we-do/products-platforms/quartz
   - https://www.tcs.com/what-we-do/products-platforms/quartz/solution/quartz-smart-solutions-dlt-friendly-ready-to-use
   - https://www.tcs.com/what-we-do/products-platforms/quartz/solution/quartz-gateway-command-center-reinvent-business-roadmap
   - https://www.tcs.com/what-we-do/products-platforms/quartz/solution/quartz-devkit-blockchain-app-development-kit
5. Use only publicly documented architectural concepts from Quartz, such as on-chain/off-chain coexistence, domain-aware smart contracts, integration adapters, API-based gateway patterns, privacy, access controls, audits and interoperability. Do not reverse-engineer, copy or claim access to proprietary source.
6. Inspect https://github.com/Aid-flow/Aidflow as an optional open-source reference for Stellar/Soroban fund pooling, allocation, milestone and audit modules. Verify the actual code, license, tests and build status before reuse. Do not assume it already implements receipt fraud detection, cross-campaign duplicate detection, privacy-preserving proof of delivery, multi-chain reconciliation or the PS 4.2 adversarial escrow behavior. If it doesn't meet those requirements, implement the missing components separately.
7. Output a concise implementation plan and requirement mapping, then continue immediately into code. Do not stop for approval unless a real blocker requires credentials or a decision only the user can make.

## SOURCE-OF-TRUTH REQUIREMENTS

All IDs `PS42-R01` through `PS42-R20` in `01_SOURCE_REQUIREMENTS_TRACEABILITY.md` are mandatory. The required system must:

- Establish an auditable connection between inbound donations, authorized allocations, transactions, off-chain expenditure evidence, delivery attestations and impact claims.
- Enforce purpose-bound allocations and release conditions using smart-contract rules for actual escrow where the contract is deployed.
- Link outgoing on-chain events to off-chain invoices/receipts using cryptographic commitments.
- Protect beneficiary identity and sensitive documents from public chain data while preserving verifiable proof/attestation of delivery.
- Detect unexplained transfers, spending outside declared categories, and mismatches between NGO reports and underlying records.
- Track multi-hop funds across multiple chains, bridges, swaps and fiat off-ramps with provenance and accurate asset/amount/fee/conversion handling.
- Detect re-use of one expenditure evidence item across multiple donor reports.
- Test a red-team dataset in which 30% of receipts are forged/altered.
- Detect cryptographic duplication and automatically prevent release of disputed funds without needing a centralized human auditor to trigger the hold.
- Implement the probabilistic chain: inbound donation → escrow condition → off-chain invoice proof → cryptographic impact verification.
- Represent missing, stale, uncertain or simulated data honestly; never invent a transaction link.

## TECH STACK AND EXECUTABILITY

Prefer the current stack if it already builds. Otherwise use:

- Next.js + React + TypeScript.
- PostgreSQL (Supabase is acceptable) for data persistence.
- Auth provider with protected server routes and role/grant-scoped access.
- Private object storage for receipts and supporting files.
- Runtime validation (e.g. Zod), automated tests, and a clear env configuration.
- Modular chain/fiat adapters rather than hard-coding a provider throughout the application.
- Optional AidFlow TypeScript SDK adapter for Soroban only after checking the repo's actual SDK API, contract deployments, RPC, tests and license.

Do not add architecture complexity that prevents the single-org pilot from running. Keep modules separated in code. Use safe financial arithmetic (integer minor units or fixed decimal), idempotent event ingestion, database transactions for state changes, and server-side authorization.

## BUILD THESE WORKING CAPABILITIES

### A. Grant and purpose management

- Create a grant with donor, amount, currency, purpose, allowed spending categories, milestones, disbursement rules and optional region/project scope.
- Add and validate allocations. Reject over-allocation and out-of-scope categories.
- Show approved, allocated, spent, unreconciled, held and remaining totals calculated from persisted records.

### B. Financial lineage across chains and fiat

- Define normalized source adapters and source-event schema.
- Handle chain identifiers, transaction hash, block/event ref, asset/decimals, amount, source/destination, event time, observed time, confirmation/finality state and provenance.
- Implement idempotency and reorg/finality handling for relevant chains.
- Represent swap and bridge as explicit edges with input/output, fees, exchange rate and source proof/reference.
- Ingest off-chain fiat records from a supported API or importable statement fixture; distinguish source-attested, manually recorded and simulated records.
- Reconcile the end-to-end path; show `UNRECONCILED` if any link lacks proof. Do not match solely by similar amounts.
- Include at least two distinct chain adapter paths at the conformance-design level; implement adapters against real sources only when testnet/RPC/provider access and integration tests exist. Any fixture path must be labeled `SIMULATED`.

### C. Real evidence upload and cryptographic commitments

- Upload actual PDF and supported image files to private storage.
- Enforce size, type and content checks; compute file SHA-256 server-side.
- Extract invoice fields if an OCR/parsing tool is available. A deterministic manual form fallback is permitted, but mark fields as user-entered rather than OCR-verified.
- Store document bytes off-chain. Record opaque commitments and evidence references on chain where implemented.
- Separate file integrity, claim field comparison, issuer signature, payment match and delivery proof statuses.
- Provide a documented canonicalization version for normalized invoice fields.

### D. Cross-donor duplicate detection and privacy-aware nullifiers

- Detect exact byte duplicates.
- Detect normalized claim duplicates across donor reports (invoice issuer/vendor, invoice identifier token, amount, currency, date and relevant claim scope).
- Distinguish exact duplicate from likely duplicate.
- Store the first related claim reference and a reason in the finding.
- Implement an atomic cross-report expense registry/nullifier. Repeated use must trigger an enforceable dispute/hold state.
- Do not put PII, raw documents or plain low-entropy invoice tuples on public chain.
- Use a reviewed privacy-aware commitment/nullifier design. If actual ZK uniqueness proof is beyond the current repo/24-hour window, do not fake one: implement the clearest testable pilot scheme, label its privacy/trust limitations, isolate the interface for a real ZK verifier, and retain the full ZK requirement as `PARTIAL`, not `COMPLETE`.
- The no-centralized-auditor scenario must be enforced by deterministic contract/registry logic when deployed, not by a person having to click a button. The contract must reject release when the duplicate condition is proven/registered according to the protocol.

### E. 30%-forged receipt red-team path

- Create a deterministic synthetic corpus with ground truth that has 30% forged/altered examples and 70% valid examples.
- Forgery mutations must include test-invalid signatures/commitments, altered signed fields, mismatch to payment record, duplicate claim reuse and inconsistent fields.
- Keep the ground-truth label hidden from the detector and use it only for evaluation.
- Produce confusion matrix, precision, recall, F1 and false-positive rate by detection rule.
- A deterministic invalid signature or commitment must fail verification. OCR similarity can flag candidate cases but must not be described as infallible.
- Do not hardcode a successful result or report fabricated model metrics.

### F. Verifiable delivery/impact proof

- Implement canonical delivery/milestone claim, signer credential/key reference, signature, unique nonce, timestamp, evidence commitment and a verifiable proof/reference.
- Verify signature and replay prevention, plus Merkle inclusion or ZK proof where a real implementation/library is available.
- Keep sensitive identity and proof source documents private; show donors only scoped claims and proof result.
- State what is actually proven (signed/committed/included) and what still relies on attestor/source trust. Do not claim a hash proves real-world impact.
- Connect proof to grant milestone and disbursement condition.

### G. Discrepancy engine and reports

Implement explainable rules for:

- Transfer not linked to an authorized grant path.
- Spending outside allowed category or exceeding allocation.
- Duplicate evidence or repeated expense nullifier.
- Invoice/payment amount or currency mismatch.
- Missing or invalid evidence/signature.
- Report total differing from supported financial events.
- Bridge, swap, conversion or fiat flow missing a source-backed link.
- Delivery claim whose signature/proof/milestone status is not valid.

Each finding must identify the rule, affected claim/grant/amount, source facts, evidence refs, confidence/limitations, status and action taken. Do not show a generic AI fraud label.

### H. Decentralized/contract-enforced hold state machine

- Implement a clear state machine: `LOCKED`, `CONDITION_PENDING`, `RELEASE_ELIGIBLE`, `ON_HOLD`, `RELEASED`, `REFUNDED`, with dispute/review states as needed.
- Contract release checks must re-read current condition and uniqueness registry, enforce purpose/cap, prevent replay/races, and reject when held.
- For duplicate nullifier conflict, the contract/registry should automatically set or enforce the disputed tranche as non-releasable; no central auditor click required.
- A human may resolve/appeal but must not be the sole duplicate detector or hold trigger. Require an auditable resolution method; the claimant must not clear its own hold.
- If no real contract is deployed, implement application-level state enforcement for the demo and label it `APP_HOLD`/`SIMULATED`; do not claim actual on-chain escrow is frozen. The overall coverage matrix must mark the no-central-auditor contract requirement `PARTIAL` until verified contract tests pass.

### I. Private donor verification, audits and data security

- Admin sees authorized operational data; donor sees a grant-scoped privacy-safe projection.
- Raw documents/private PII remain off-chain and behind server authorization/private storage policies.
- Use append-only audit events and a tamper-evident chain/hash construction if practical; implement an integrity verifier and tests.
- Don't log tokens, private keys, raw documents, beneficiary PII or unnecessary invoice content.
- Protect file APIs against broken object authorization, traversal, XSS, malicious files, SSRF (if remote URL fetch exists), oversized uploads and replay.
- Use environment variables, secure cookies, server-only credentials, appropriate rate limits, database constraints and transaction boundaries.

### J. Human-designed UI, not AI-generated-looking UI

Follow `03_DRD.md` exactly. Build an elegant, grounded enterprise finance tool:

- Warm off-white background, graphite text, restrained evergreen accent and muted semantic warning colors.
- Strong typography hierarchy and tabular numerals; compact data tables, clear timelines, readable status labels, deliberate whitespace.
- Use cards only for grouped tasks, not for every element.
- No purple/blue gradients, glowing effects, glassmorphism, floating blobs, animated backgrounds, exaggerated rounded cards, fake charts, random percentages or stock “AI insights” widgets.
- Don't fabricate results, brand logos or TCS affiliation.
- Every status explains what was checked and what remains unknown.
- Responsive, accessible, keyboard-friendly, with loading/error/empty states.

### K. Demo and operational workflow

Create a deterministic seed/reset process (development only) with a fictional grant and synthetic vendors. Include the clean case, duplicate cross-donor case, 30% forged/altered corpus, category violation, transfer gap, bridge/swap and fiat off-ramp fixture, valid and invalid delivery attestation, and held-release attempt.

Demo data must be visibly labeled `SIMULATED`. Never reset or delete live data automatically.

## REQUIRED TECHNICAL DELIVERABLES

- Working application and source code.
- DB schema/migrations and seed fixture commands.
- `.env.example` with no secrets.
- `README.md` with local setup/build/test/deploy instructions.
- Unit, integration, end-to-end and contract tests where contracts are included.
- A traceability table linking `PS42-R01` through `PS42-R20` to code, tests and UI.
- A report of actual executed test commands/results, build/runtime status and blockers.
- Threat model and data/privacy trust assumptions.
- A known limitations list with clear `IMPLEMENTED`, `PARTIAL`, `SIMULATED` and `NOT IMPLEMENTED` labels.
- A demo script and sample output from the red-team corpus.
- Optional AidFlow integration in its own adapter/module, not tightly coupled to core domain logic.

## EXECUTION ORDER

1. Repo inspection and Quartz/AidFlow review.
2. Data model, auth, environment and migrations.
3. Grant, allocation and financial event ledger.
4. Evidence upload, hash, normalized fields and private storage.
5. Duplicate engine and nullifier registry.
6. Discrepancy rules and contract/application hold path.
7. Delivery attestation and impact timeline.
8. Chain/bridge/swap/fiat adapters, with test fixtures clearly labeled.
9. Donor portal, reports and audit trail.
10. Design polish per DRD.
11. Automated tests, security review, build and deployment preparation.
12. Final coverage report and demo rehearsal.

If time is constrained, finish the end-to-end critical flow before optional UI enhancements. Do not silently replace a required capability with a mock. If only a mock/fixture is delivered, label the specific requirement `SIMULATED` or `PARTIAL` and provide the exact next step to make it real.

## FINAL ACCEPTANCE GATE

Before claiming success, run all feasible commands and show the actual output. Verify that:

- the app builds and starts;
- data persists after refresh/re-login;
- receipt upload and server-side hash work;
- duplicate evidence across two reports is identified;
- a forbidden release is rejected;
- 30% forged fixture scenario is evaluated with ground truth kept separate;
- private data is not returned to donor/public endpoints;
- the multi-hop chain/fiat story indicates which events are actual vs simulated;
- signed delivery evidence is verified by real code;
- audit integrity can be checked;
- no secrets were committed;
- each source requirement has an evidence-backed status.

Do not call the whole solution “fully PS-compliant” if any mandatory requirement is only simulated, not implemented, or lacks a test. Be explicit about the gap and keep working where feasible.
