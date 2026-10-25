# Architecture & Trust Model — TrustFabric

## 1. Reference architecture

```text
                Donor / Admin / Delivery Attestor
                             |
                      Web Application
                             |
                       REST API Layer
                             |
   ----------------------------------------------------------
   | Grant policy | Evidence service | Reconciliation engine |
   | Duplicate registry | Delivery proofs | Reporting         |
   ----------------------------------------------------------
              |                |                  |
       PostgreSQL       Private object store    Job/event queue
              |                |                  |
              +-------- Audit & verification ----+
                             |
                     Adapter / Gateway Layer
                 /             |               \
         Chain adapters    Bridge/swap       Fiat/source adapters
       (e.g. Soroban)      event parsers      (bank/provider CSV/API)
                 \             |               /
                  \\----- Verifiable source events -----//
                             |
                Escrow / uniqueness registry contract
                or clearly marked application simulator
```

This follows the public enterprise DLT principle of keeping conventional systems and DLT in coexistence, placing only selected verifiable actions on a ledger. Quartz documentation describes such on-chain/off-chain separation and a REST-based Gateway concept; this is inspiration, not code reuse or a claim of equivalence.

## 2. Fund lineage graph

The canonical lineage should represent events as nodes and evidence-backed relationships as edges.

Example:

```text
Donation (Chain A)
  -> Allocation (Grant CW-2026-014)
  -> Swap (Token A -> Token B, fee + rate evidence)
  -> Bridge source event (Chain A)
  -> Bridge destination event (Chain B, proof/reference)
  -> Off-ramp payout (provider/bank source reference)
  -> Fiat transfer (statement record)
  -> Vendor payment
  -> Invoice commitment
  -> Delivery attestation
  -> Impact claim
```

Every hop needs its own provenance and verification status. If a bridge mapping, bank reference, rate, or vendor relationship is not verifiable, show the gap and affected amount. The system must not join records solely because amounts look similar.

## 3. Evidence pipeline

1. Ingest a document privately.
2. Validate file content, size and allowed type.
3. Compute raw file digest.
4. Extract fields (OCR/parsing if supported) and store raw extraction separately from normalized values.
5. Generate a canonical normalized expense representation under a documented schema/version.
6. Compute the applicable commitment/nullifier using the configured privacy strategy.
7. Compare against cross-report registry.
8. Verify signed issuer/attestor data when available.
9. Check payment linkage, scope/category, amount and release conditions.
10. Record separate results and append an audit event.

A file hash is integrity evidence, not authenticity evidence. Similarity match is a lead, not definitive fraud. A signed invoice proves control of a signing key, not automatically that the goods were delivered.

## 4. Duplicate and no-central-auditor design

### Required behavior

A claim for an already registered expenditure must not quietly pass. A deterministic, verifiable duplicate signal should trigger a contract-enforced hold on the disputed tranche without waiting for a central auditor.

### Recommended full design

- Use a cross-donor expense uniqueness registry or nullifier contract.
- The claimant submits an opaque expense nullifier and proof that it corresponds to a well-formed invoice/expense claim under the verification protocol.
- The contract enforces uniqueness atomically. If the nullifier has already been consumed/registered for an incompatible claim, record a conflict and place the affected tranche on hold/reject release.
- Do not put invoice text, beneficiary identity, address, tax ID or unkeyed low-entropy invoice tuples on a public chain.
- Use a reviewed privacy-preserving commitment/zero-knowledge approach in production where equality must be proven without disclosing fields. If the MVP uses a server-side normalized hash/keyed token, mark it a pilot compromise and describe the centralized trust assumption. The contract may enforce a submitted token but cannot prove the off-chain token-generation service told the truth unless a proof/attestation protocol supplies that assurance.
- Dispute resolution can permit a documented appeal/multi-party procedure. The original claimant alone must not remove the hold.

### Important nuance

“Without a centralized auditor” does not remove all trust assumptions. OCR, issuer confirmations, bank feeds, delivery signers and contract oracles each have their own trust boundaries. The design must state them and use verifiable signatures, proofs, deterministic policy enforcement, and multiple independent sources where practical.

## 5. Receipt-forgery model

A 30% forged-receipt red-team scenario is a requirement. Build a generated corpus with labeled ground truth and deterministic manipulations such as:

- Amount changed while invoice ID remains.
- Vendor changed while receipt signature/QR/signature payload no longer verifies.
- Same invoice number and total reused across reports.
- Duplicate file re-encoded/renamed.
- Forged/invalid test issuer signature.
- Invoice total inconsistent with associated bank/payment record.
- Missing required signature or source record.

Use valid synthetic signed receipts for the clean corpus and invalidly signed/altered variants for the known-forged set. Report precision, recall, false positives and a confusion matrix. Do not imply that arbitrary high-quality forged paper images can be recognized with certainty from visual appearance alone. In real deployment, trustworthy issuer confirmation, signed e-invoicing or payment records materially improve assurance.

## 6. Mathematical proof of delivery

A minimal verifiable delivery record should contain:

- Canonical claim: milestone/deliverable ID, completion statement, bounded timestamp, grant/claim commitment, and an opaque recipient reference.
- A registered signer/credential or authorized witness key.
- Signature over the canonical claim.
- Fresh nonce or unique claim ID for replay prevention.
- Commitment to supporting evidence and optional Merkle inclusion proof.
- Revocation/status policy for the signer credential.
- Minimal public proof; personal details and raw files remain private.

Verification establishes that the registered key signed the statement, the message matches its commitment, and the record is included/unchanged. It does not magically prove the physical-world claim if the signer or evidence source lies. The UI must say “delivery attestation verified” rather than “delivery is objectively proven” unless independent verification supports that stronger claim.

## 7. Multi-chain, bridge, swap and fiat approach

### Chain adapters

Each adapter normalizes transaction ID, network ID, block/height, event index, asset identifier/decimals, amount, sender/recipient references, timestamp, confirmation/finality, contract call/event and raw source link. Idempotency and reorg policy are chain-specific.

### Bridges

Track source lock/burn and destination mint/release references. Do not assume the two events are linked until a bridge proof/provider event or robust verified mapping validates the connection. Record fees and amount differences.

### Swaps

Record input asset/amount, output asset/amount, rate, fee, slippage and source transaction. Link output proceeds to subsequent edges only via verifiable event/source evidence.

### Fiat off-ramp

Use a provider API or signed statement/feed where available. For a demo, import a documented fixture and label it `SOURCE_ATTESTED` only if its signature/source validation actually runs; otherwise mark `MANUALLY_RECORDED` or `SIMULATED`. Match counterparty/payment reference, date, amount and currency with the vendor claim, accounting for fees and conversion rates.

### Incomplete data

Show partial paths, missing edges, stale data, unknown source, and uncertainty. Do not create invented chain/fiat links.

## 8. Privacy model

- Store sensitive documents in private storage, never on a public chain.
- Use scoped access by grant/donor role and separate admin access from donor projection.
- Use opaque IDs and minimal public commitments.
- Evaluate equality/linkability leakage caused by duplicate-detection nullifiers. If a public nullifier reveals that two grants refer to the same expense, document this as a privacy trade-off; production may need ZK proof/private registry protocol to hide linkability from public observers while allowing the contract to enforce uniqueness.
- Log only IDs, event types and minimal metadata; do not log raw PII, document text or credentials.
- Support retention/deletion rules for off-chain documents while preserving necessary non-PII audit commitments, subject to legal policy.
- Verify at API level that donor views cannot fetch arbitrary storage keys or private beneficiary data.

## 9. Release state machine

```text
DRAFT -> SUBMITTED -> EVIDENCE_PENDING -> CONDITIONS_PENDING
  -> RELEASE_ELIGIBLE -> RELEASED

Any mandatory rule conflict or valid duplicate nullifier:
  SUBMITTED / EVIDENCE_PENDING / CONDITIONS_PENDING
  -> DISPUTED -> ON_HOLD

ON_HOLD -> CLEARED -> conditions re-evaluated -> RELEASE_ELIGIBLE
ON_HOLD -> REJECTED / REFUND_REQUIRED
```

Transitions are enforced server-side and, for real escrow, by contract. The web UI must not be the authority. Every transition emits an auditable event. A release must re-check the latest contract/registry state to prevent a race between verification and transfer.

## 10. Trust assumptions and failure modes

- Chain RPC/provider can be unavailable or return stale data.
- Chain reorgs may invalidate observations before finality.
- Bridge records may be incomplete or bridge can be compromised.
- Fiat feeds can be forged, delayed or inconsistent.
- Vendors can lie or have compromised signing keys.
- A signed delivery attestation proves the signature/source, not physical truth.
- Normalized duplicates can false-positive for legitimate recurring invoices; require claim-context rules and explainable review.
- OCR can misread digits; preserve source snippet/coordinates where possible and don't auto-reject solely on low-confidence OCR.
- A server-side nullifier service introduces trust assumptions unless backed by cryptographic proof or decentralized protocol.
- Smart-contract bugs can cause irreversible losses; testnet only until independently reviewed.
