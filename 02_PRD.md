# Product Requirements Document (PRD) — TrustFabric

## 1. Product summary

**TrustFabric** is an evidence-verification and fund-reconciliation application for restricted NGO grants and donor-funded programs. It connects donations and approved allocations to on-chain transactions, off-chain fiat payments, invoices/receipts, signed delivery evidence, and published impact claims. It detects duplicate or inconsistent expenditure evidence and enforces auditable policy holds on disputed disbursements.

The product is a domain-specific application that may integrate with enterprise DLT infrastructure. It is not a recreation of TCS Quartz and must not claim to implement TCS's proprietary internals.

## 2. Problem

Fund flows, expenditure documents, and impact reports are fragmented. A public blockchain can show that a transaction occurred but generally cannot prove that a vendor invoice is genuine or that a real-world deliverable was completed. NGOs could reuse one invoice across donor reports or submit fabricated/altered receipts. Beneficiary privacy must be protected while donors still receive verifiable evidence.

## 3. Goals

1. Trace each grant from inbound donation through allocation, transfer(s), off-ramp, vendor expenditure, evidence and delivery/impact attestation.
2. Enforce purpose-bound allocations and configured release conditions.
3. Link off-chain evidence to financial events using verifiable cryptographic commitments.
4. Detect cross-report duplication and discrepancies.
5. Handle multiple-chain, bridge/swap and fiat events through adapters with provenance/finality information.
6. Protect beneficiary information and sensitive documents.
7. Make critical duplicate/eligibility holds enforceable without depending on a central human auditor to trigger them.
8. Provide a polished, usable demonstration with one admin and read-only donor access.
9. Make every verification status explainable and auditable.

## 4. Non-goals for the 24-hour pilot

- Recreating the full TCS Quartz product suite or its source code.
- Supporting all chains, bridges, banks, fiat providers, or all currencies in production.
- Making unverified claims about physical impact from an uploaded photo or a blockchain event.
- Production custody or direct movement of real funds before independent security, legal and operational review.
- Fully autonomous AI decisions that declare fraud without an evidence trail.
- Implementing a new cryptographic primitive. Use reviewed libraries and standard algorithms.

## 5. Personas

### Grant administrator (primary pilot user)
Creates grants, imports transactions, uploads evidence, resolves discrepancies, monitors holds and prepares reports.

### Donor / funding partner (read-only)
Views its authorized grant, transfer lineage, expenditure evidence status, discrepancy summary, and proof references without beneficiary PII.

### Vendor / delivery attestor (future/in-scope proof model)
Signs a receipt or delivery statement or provides a verifiable provider record. The pilot may use test signing identities, clearly labeled synthetic.

### Independent verifier / protocol participant (architecture role)
Validates a commitment, proof, contract result or provider signature without receiving private source documents unnecessarily.

## 6. Core user journeys

### Journey A: create and fund a grant
1. Admin creates a grant with donor, amount, currency, purpose, allowed categories, beneficiary scope, milestones and release conditions.
2. The system validates amount and required fields.
3. Inbound donation arrives as a chain event or is entered/imported as a fiat record with a source status.
4. Every event has stable ID, source reference, provenance and verification state.
5. The grant overview shows confirmed, attested, simulated and unverified sources separately.

### Journey B: follow multi-hop funds
1. Ingest source-chain transfer.
2. Record a swap/conversion edge and the input/output amounts, assets, fees and rate provenance.
3. Record a bridge edge with source/destination chain references and bridge proof/provider event.
4. Record an off-ramp event and its fiat payment statement/reference.
5. Reconcile each hop; show missing links as gaps rather than inventing a path.
6. Produce a chronological timeline and graph of the fund lineage.

### Journey C: attach and verify expenditure evidence
1. Admin creates an expense claim and links it to an outgoing transaction.
2. Receipt/invoice is uploaded into private storage.
3. The server validates type/size, extracts document text/fields when available, computes file digest and a canonical commitment, and stores the evidence record.
4. The system compares file and invoice fingerprints against a cross-report registry.
5. It verifies issuer signatures, signed e-invoice metadata, vendor confirmation or other independent source when available.
6. Output uses separate statuses: file integrity, invoice match, payment reconciliation, issuer authenticity and delivery verification.

### Journey D: detect duplicate claim and automatically hold
1. The second claim references the same expenditure fingerprint/nullifier as an existing claim.
2. The duplicate engine returns the previous claim and evidence references.
3. A duplicate proof or duplicate registry result triggers the configured escrow state transition without a central human clicking “hold.”
4. The contract/escrow adapter rejects a release attempt for the disputed tranche.
5. The application records why the hold occurred and exposes the reason to authorized roles.
6. A dispute flow can clear/reject/reassign the claim; every action is auditable. A human may resolve the case but is not the sole duplicate detector/hold trigger.

### Journey E: prove delivery while protecting privacy
1. Delivery attestor creates a canonical delivery claim tied to a project milestone.
2. Attestor signs it using a registered signing key or verifier credential.
3. The system verifies signature, nonce/time validity, and evidence commitment; where implemented, verify Merkle inclusion or ZK proof.
4. Only the required commitment/status is published to the ledger; sensitive identity/documents remain private.
5. Donor can verify the attestation and its relationship to the funded milestone without seeing personal data.
6. The UI explains the trust root and what has not been independently established.

### Journey F: report discrepancy
1. A report claims a total/impact metric.
2. The system recalculates its supported total from eligible evidence-backed claims.
3. Differences, unexplained transfers, category violations and missing source edges produce findings.
4. Report includes source IDs, confidence/status, totals, differences and methodology.

## 7. Functional requirements

Requirements `PS42-R01` through `PS42-R20` in `01_SOURCE_REQUIREMENTS_TRACEABILITY.md` are binding. Primary feature groups:

- Grant and allocation management.
- Financial ledger with provenance.
- Chain adapters and idempotent event ingestion.
- Bridge/swap/fx/off-ramp lineage and reconciliation.
- Private evidence registry.
- Exact and normalized duplicate detection.
- Authenticity checks and signed attestations.
- Discrepancy engine.
- Purpose-bound release/escrow state machine.
- Cross-report duplicate registry/nullifier enforcement.
- Privacy controls and donor projection.
- Append-only/tamper-evident audit log.
- Evidence-backed reports and impact timeline.
- Test fixtures, red-team dataset and coverage matrix.

## 8. Verification status vocabulary

Never collapse all evidence into one `verified: boolean`. Use independent dimensions:

- `source_status`: `ON_CHAIN_VERIFIED`, `SOURCE_ATTESTED`, `MANUALLY_RECORDED`, `SIMULATED`, `UNVERIFIED`.
- `document_integrity`: `MATCH`, `MISMATCH`, `NOT_CHECKED`.
- `invoice_check`: `VALIDATED`, `SUSPICIOUS`, `UNVERIFIED`, `NOT_APPLICABLE`.
- `payment_reconciliation`: `MATCHED`, `PARTIAL`, `MISMATCH`, `UNRECONCILED`.
- `delivery_proof`: `SIGNATURE_VALID`, `PROOF_VALID`, `INVALID`, `MISSING`, `ATTESTED_ONLY`.
- `claim_status`: `DRAFT`, `SUBMITTED`, `VERIFIED_UNDER_RULES`, `NEEDS_REVIEW`, `DISPUTED`, `CLEARED`, `REJECTED`.
- `disbursement_status`: `LOCKED`, `CONDITION_PENDING`, `RELEASE_ELIGIBLE`, `ON_HOLD`, `RELEASED`, `REFUNDED`.

Show the source and method for each status.

## 9. Success measures

Measure; do not fabricate:

- % of donation value connected to a traceable path.
- % of expenditure value with a linked evidence record.
- Exact duplicate detection precision/recall.
- Normalized duplicate candidate precision/recall.
- Detection precision/recall on a synthetic 30%-forged dataset with known labels.
- False-positive rate on legitimate altered-format invoices.
- % of multi-hop records reconciled with source-backed links.
- Count/value of unauthorized or unexplained movements flagged.
- Count of release attempts rejected because of `ON_HOLD` state.
- % of delivery attestations with valid cryptographic verification.
- PII leakage tests passed.
- Audit-chain integrity tests passed.
- API p95 latency and upload error rate for pilot dataset.

## 10. MVP acceptance criteria

The pilot is accepted only if:

1. A logged-in administrator can create a grant and persist its allocations.
2. Transactions and expense claims are stored in the database with correct relationships and safe money arithmetic.
3. A genuine PDF/image can be uploaded into private storage, fingerprinted server-side and linked to a claim.
4. Reusing a receipt in a second donor report triggers a reproducible duplicate finding with both claim references.
5. The required deterministic duplicate scenario automatically blocks/holds release in the configured ledger/contract path; if only simulated, the interface labels it clearly.
6. A release attempt against a held claim is rejected server-side and, if deployed, by contract logic.
7. A 30%-forged synthetic corpus runs through the verification workflow and produces a confusion matrix.
8. A supported chain event and a separate chain fixture can be reconciled through adapter boundaries; simulated events are labeled.
9. Off-chain fiat evidence can be imported from a fixture/API adapter and matched or marked unreconciled.
10. Beneficiary PII and raw documents do not appear in public events or donor API payloads.
11. Signed delivery evidence can be verified and tied to an impact claim; limits are disclosed.
12. Audit events survive restart and can be integrity-checked.
13. Test commands, build commands and actual test results are documented.
14. The UI works at desktop and mobile widths and follows DRD human-designed visual principles.

## 11. Constraints

- One organization, one administrator and at least one donor-facing read-only view for the pilot.
- Use `SIMULATED` labels for fixtures and mocks.
- Keep the architecture modular for future providers.
- No secret/private key in client code or repository.
- Real-money operation is out of scope until independent audit and operational review.
