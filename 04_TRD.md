# Technical Requirements Document (TRD) — TrustFabric

## 1. Architecture principle

Use an on-chain/off-chain architecture inspired by publicly documented enterprise DLT patterns: conventional services remain responsible for files, document processing, APIs and reporting; ledger/contract components handle selected verifiable commitments, allocation constraints and release conditions. TCS Quartz is a reference for publicly documented principles only. Do not copy or claim access to its proprietary source code.

## 2. Recommended stack

Default choice unless the repository already has a functioning stack:

- Frontend/server: Next.js App Router + TypeScript.
- UI: Tailwind CSS + a consistent accessible component library where appropriate.
- DB: PostgreSQL via Supabase or a managed PostgreSQL service.
- Auth: Supabase Auth or the existing secure provider.
- Files: private object storage (Supabase Storage or compatible storage).
- Validation: Zod or equivalent runtime schema validation.
- Tests: Vitest/Jest for unit tests, Playwright for critical UI flows, plus contract tests.
- Chain integrations: adapter interface; optional AidFlow/Soroban TypeScript SDK where its current code, tests, contract IDs and RPC are verified. Other chain adapters must be implemented only where scope, SDK and test access exist.
- Observability: structured server logs with PII redaction and request/event IDs.

Do not add needless services or microservices for a single-organization pilot. Keep domain logic modular in one deployable application until scaling requires separation.

## 3. Logical modules

1. `identity-access`: user identity, roles, grant-specific donor authorization.
2. `grant-policy`: grant creation, purpose/category/milestone policy and allocation constraints.
3. `financial-ledger`: normalized movement events and lineage graph.
4. `chain-adapters`: chain-specific event and finality readers.
5. `bridge-swap-adapters`: known bridge/swap event parsers and explicit lineage metadata.
6. `fiat-adapters`: CSV/statement/provider imports and signed source confirmations.
7. `evidence-service`: private upload, file type/size checks, content hash, commitment and metadata extraction.
8. `duplicate-registry`: exact hash and normalized claim matching; shared cross-report expense nullifier; privacy-aware comparison design.
9. `verification-engine`: signature, commitment, inclusion-proof, claim-field and source-status checks.
10. `discrepancy-engine`: unexplained edges, purpose/category mismatch, report total mismatch and missing evidence.
11. `escrow-policy`: contract/adapter interface for purpose-bound release and hold enforcement.
12. `delivery-proof`: signed milestone delivery claims, nonce/replay prevention, inclusion proof and privacy scope.
13. `audit-service`: append-oriented history and integrity verification.
14. `reporting`: donor-safe projections and evidence-backed totals.
15. `demo-fixtures`: deterministic synthetic dataset and adversarial scenario runner, isolated from live sources.

## 4. Data model (minimum)

### `organizations`
`id`, `name`, `status`, `created_at`.

### `users/profiles`
`id`, `auth_subject`, `role`, `organization_id`, `status`, timestamps. Do not duplicate sensitive attributes without a need.

### `donors`
`id`, `display_name`, `access_policy`; any donor identity secrets live outside the public ledger.

### `grants`
`id`, `grant_code`, `donor_id`, `organization_id`, `purpose`, `currency`, `authorized_amount_minor`, `allowed_categories`, `milestone_policy`, `status`, `created_at`, `updated_at`.

### `allocations`
`id`, `grant_id`, `category`, `amount_minor`, `currency`, `milestone_id`, `condition_hash`, `status`, optional `contract_ref`.

### `financial_events`
`id`, `grant_id`, `event_type`, `source_type`, `source_chain_id`, `tx_hash`, `block_number`, `block_hash`, `finality_status`, `source_account_ref`, `destination_ref`, `asset_id`, `amount_minor`, `currency`, `fee_minor`, `exchange_rate`, `occurred_at`, `observed_at`, `provenance`, `simulated`, idempotency key.

### `flow_edges`
`id`, `from_event_id`, `to_event_id`, `edge_type` (`TRANSFER`, `SWAP`, `BRIDGE`, `OFFRAMP`, `PAYMENT`, `ALLOCATION`), `amount_in_minor`, `asset_in`, `amount_out_minor`, `asset_out`, `fee_minor`, `rate`, `link_evidence_id`, `link_status`, `confidence_reason`.

### `expense_claims`
`id`, `grant_id`, `vendor_ref`, `invoice_number_token`, `currency`, `amount_minor`, `invoice_date`, `category`, `purpose_ref`, `payment_event_id`, `delivery_milestone_id`, `claim_status`, `disbursement_status`, timestamps.

### `evidence_documents`
`id`, `claim_id`, `storage_key`, `mime_type`, `size_bytes`, `sha256`, `canonical_commitment`, `expense_nullifier_ref`, `extracted_fields_json`, `issuer_signature_ref`, `verification_status`, `uploaded_by`, timestamps. Avoid storing raw PII in commitments or logs.

### `duplicate_matches`
`id`, `claim_id`, `matched_claim_id`, `match_type`, `score_or_rule`, `evidence_refs`, `status`, timestamps. Exact duplicate and likely duplicate must be distinct.

### `delivery_attestations`
`id`, `claim_id`, `milestone_id`, `canonical_statement_commitment`, `signer_credential_ref`, `signature`, `nonce`, `issued_at`, `proof_ref`, `verification_status`.

### `verification_findings`
`id`, `grant_id`, `claim_id`, `type`, `severity`, `rule_id`, `explanation`, `evidence_refs`, `finding_status`, timestamps.

### `escrow_cases`
`id`, `grant_id`, `claim_id`, `tranche_id`, `state`, `trigger_finding_id`, `contract_ref`, `last_transition`, `transition_reason`.

### `audit_events`
`id`, `sequence`, `actor_ref`, `action`, `entity_type`, `entity_id`, `timestamp`, `reason`, minimal `before_hash`, minimal `after_hash`, `prev_event_hash`, `event_hash`, `source_ref`.

### `reports`
`id`, `grant_id`, `report_period`, `reported_total_minor`, `calculated_total_minor`, `difference_minor`, `impact_claims_json`, `evidence_refs`, `status`, timestamps.

Money must use integer minor units or a decimal type with explicit currency scale. Never use JavaScript floating-point for authoritative money calculations. Define token precision per asset.

## 5. Data integrity and event ingestion

- Event ingestion must be idempotent. Use `(chain_id, tx_hash, log_index)` or provider-scoped idempotency keys.
- Re-fetch and handle chain reorgs/finality changes where the underlying chain requires it.
- Record observed time separately from event time.
- Preserve raw source references and parser/version metadata for event reconstruction.
- Never infer a bridge/swap link solely from similar amounts. A link must have source/provider proof or an explicit unverified status.
- Preserve original imported source rows and normalized records for auditability, subject to privacy/retention controls.
- Reconciliation must explicitly account for fees, slippage, exchange-rate provenance, asset decimals and partial transfers.

## 6. Evidence and privacy requirements

- Allow only explicitly permitted MIME types/extensions and check actual content signatures when feasible.
- Use upload size limits, private storage, short-lived access URLs and access authorization on every read.
- Compute file hash on trusted server/runtime, not from client input.
- Canonicalize fields with documented normalization rules, e.g. whitespace, currency, date format and vendor identity; retain the original values for review.
- Keep file digest, canonical invoice fingerprint and document-authenticity result separate.
- Do not publish raw files or beneficiary PII on-chain.
- A plain digest of low-entropy invoice fields can be dictionary-attacked. For production, use a reviewed privacy-preserving nullifier/commitment design; document equality/linkability leakage and do not overstate privacy.
- If a keyed token is used in the pilot, identify the key holder and centralized trust assumption. Do not claim the design is fully decentralized if one service can control duplicate identity.
- Signed delivery attestations require key/credential registration, revocation policy, nonce replay defense and signature verification.

## 7. Contract/escrow requirements

Minimum contract policy interface:

- `createGrant` / initialize authorized grant rules.
- `allocate` under authorized purpose/category and amount bounds.
- `commitEvidence` or `registerExpenseNullifier` with only minimal opaque commitment data.
- `markDuplicateOrDisputed` when an enforceable duplicate proof/nullifier conflict is submitted; the contract must not depend on a human auditor clicking hold.
- `holdTranche` / transition to a non-releasable state triggered by defined proof/rule.
- `release` only when all required conditions are true and the tranche is not held.
- `resolveDispute` under a documented, auditable resolution rule (multi-party, governance, appeal or authorized dispute mechanism); never allow the original claimant alone to clear its own hold.
- event emissions for every state transition.

All public functions must enforce authorization, amounts, grant boundaries, non-reentrancy/chain-specific safe patterns, replay prevention and valid state transitions. Use reviewed standard libraries where appropriate. Contract code and exact functions depend on chosen chain.

For the pilot, an application-level hold can be used before a contract is deployed, but label it `APP_HOLD` and state that it does not freeze actual on-chain or bank funds. Full PS architecture requires a real enforceable path for the duplicate-detection scenario. If using AidFlow, inspect the actual contract code and tests first; do not assume its current milestone flag can implement all PS 4.2 features.

## 8. API requirements

All endpoints must validate input server-side and apply role/grant access checks. Example routes:

- `POST /api/grants`
- `GET /api/grants`
- `GET /api/grants/:id`
- `POST /api/grants/:id/allocations`
- `POST /api/financial-events/import`
- `POST /api/financial-events/chain-sync` (protected worker/admin)
- `GET /api/grants/:id/fund-flow`
- `POST /api/claims`
- `POST /api/claims/:id/evidence` (prefer signed upload flow/private storage)
- `POST /api/evidence/:id/verify`
- `POST /api/claims/:id/duplicate-check`
- `GET /api/findings`
- `POST /api/claims/:id/hold` (internal rule path; not a public arbitrary client toggle)
- `POST /api/claims/:id/review` (authorized, reason required)
- `POST /api/claims/:id/release` (server checks policy and contract state)
- `POST /api/delivery-attestations/verify`
- `GET /api/grants/:id/audit`
- `GET /api/donor/grants/:id/verification` (privacy-safe projection)
- `POST /api/reports/reconcile`
- `POST /api/demo/reset` (development-only, explicit confirmation, never production)

Return stable error codes, correlation IDs and safe error text. Never return secrets, raw document content, or unnecessary personal data.

## 9. Security

- Server-side authentication and role-based authorization.
- Row-level access policies or equivalent checks on every read and write.
- Secrets only in environment/managed secret storage; no private keys in browser or git.
- Validate and normalize all inbound data; apply upload malware/type checks as practical.
- Rate-limit auth, upload and verification endpoints.
- Protect against SQL injection, XSS, SSRF from document fetching, path traversal, insecure direct object references and replay.
- Use CSRF-safe patterns where applicable; configure secure cookies and security headers.
- Append-only audit writes for sensitive state transitions.
- Backups and restore runbook before real use.
- Threat model admin compromise, NGO collusion, malicious vendor, duplicate source events, chain reorg, compromised attestor keys, leaked donor link, stolen upload URL and dishonest data providers.

## 10. Chain adapters

Define a normalized adapter contract such as:

- `getEvent(ref)`
- `listEvents(cursor, filters)`
- `verifyTransaction(ref)`
- `getFinality(ref)`
- `submitCommitment(payload)`
- `getCommitment(ref)`
- `submitHold/Release` where supported.

Include adapter metadata: network ID, endpoint, supported operations, finality approach, provider trust and whether it is live/testnet/simulated. Don't claim interoperability just because a TypeScript interface exists; each implemented adapter needs an integration test against its actual SDK/provider or clearly labeled fixtures.

## 11. Fiat and off-ramp adapters

- Accept test CSV/statement imports with fixed schema and row-level provenance.
- Support later provider APIs only when credentials and documentation exist.
- Store bank reference, amount/currency, value date, counterparty token, source signature/verification status and match rationale.
- Match off-ramp payout to fiat receipt and vendor claim; partial matches must remain partial.
- Do not call manual CSV data “independently verified” unless separately attested.

## 12. Test requirements

Use `06_ACCEPTANCE_AND_RED_TEAM_TESTS.md`. Add unit, integration, end-to-end, contract, privacy and adversarial tests. Build must fail on a prohibited release from held state. Test all calculations against currency precision and partial/fee scenarios.

## 13. Deployment

Default: Next.js + PostgreSQL/Supabase + private storage + managed hosting. Produce `.env.example`, migrations, seed/test fixture command, README and deployment procedure. Do not assert cloud deployment without an observed URL and successful smoke tests. Use a testnet contract for on-chain demonstration; no real-money escrow or beneficiary payouts in the one-day pilot.
