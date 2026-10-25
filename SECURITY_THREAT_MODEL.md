# TrustFabric — Comprehensive Security & Threat Model
**Document Version:** 1.0.0  
**Target Specification:** CASCADE ’26 Theme 4, Problem 4.2: *The Black Hole Ledger: Verifiable NGO Fund Flows*  
**Date:** 2026-10-25  

---

## 1. Executive Summary & Security Objectives

TrustFabric is a verifiable NGO fund flow assurance system engineered to eliminate fraud, duplicate expense billing, unauthorized disbursement, and dark fund movements across international borders. 

The security architecture addresses the core tension in humanitarian and philanthropic finance: **transparency and accountability to donors versus privacy and physical security for vulnerable beneficiaries.**

### Primary Security Objectives
1. **Purpose-Bound Escrow Enforcement:** Prevent escrow tranches from releasing funds unless explicit cryptographic milestones, budget caps, and authorized categories are satisfied on-chain.
2. **Deterministic Cross-Grant Deduplication:** Prohibit the reuse of a single invoice, receipt, or physical expenditure deed across multiple donor reports or NGO projects without exposing plain invoice metadata.
3. **Decentralized Dispute Freezing:** Ensure that evidence collisions or tamper events automatically halt smart contract execution without relying on a centralized auditor to detect and manually pause releases.
4. **Beneficiary PII Shielding:** Ensure zero personally identifiable information (names, national IDs, precise geolocation, biometric signatures) appears on public blockchains or in unencrypted public ledgers.
5. **Multi-Hop Financial Integrity:** Validate cross-chain swaps, bridge transfers, and fiat bank settlement without fabricating or guessing unreconciled links.

---

## 2. System Architecture & Trust Boundaries

```
 [ Untrusted Internet / Field Officers / Donors ]
                       │
             TLS 1.3 / HTTPS API
                       ▼
 ┌────────────────────────────────────────────────────────┐
 │           TrustFabric Application / API Gateway         │
 │  - JWT Role-Based Access Control (Admin, Auditor, etc.)│
 │  - Rate Limiting & Input Canonicalization              │
 └──────────┬───────────────────────────────┬─────────────┘
            │                               │
            ▼                               ▼
 ┌──────────────────────┐        ┌────────────────────────┐
 │ PostgreSQL / Supabase│        │ Private Blob Storage   │
 │ - Row-Level Security │        │ - Encrypted at Rest    │
 │ - Transactional Stored│       │ - Time-Limited Signed  │
 │   Procedures (ACID)  │        │   URLs (Max 15 min)    │
 └──────────────────────┘        └────────────────────────┘
            │                               │
     Commitments / Hashes           Off-Chain Payloads
            │                               │
            ▼                               ▼
 ┌────────────────────────────────────────────────────────┐
 │  Decentralized Settlement Layer (EVM / Sepolia)        │
 │  - TrustFabricEscrow.sol                               │
 │  - Global expenseNullifierRegistry                     │
 │  - AutomatedHoldTriggered / DoubleReleasePrevented     │
 └────────────────────────────────────────────────────────┘
```

### Trust Zones
- **Zone 0 (Public Blockchain / On-Chain State):** Publicly readable, immutable. Contains only cryptographic commitments, salted nullifier hashes, transaction hashes, and smart contract event logs.
- **Zone 1 (Protected Server & Storage):** Controlled by database Row-Level Security (RLS) policies. Private evidence PDFs, OCR tokens, and user identities. Access restricted by role (`ADMIN`, `AUDITOR`, `DONOR`, `FINANCE_OFFICER`).
- **Zone 2 (Field Officer / Client Device):** Edge capture of delivery attestations, photos, and invoice receipts. Generates Ed25519 signatures and local SHA-256 digests. Treated as semi-trusted (signatures verified against registered public keys).
- **Zone 3 (External Financial Systems):** EVM RPC nodes, Uniswap contracts, Polygon Bridge contracts, and fiat bank clearing networks (NEFT/RTGS). Verified strictly via log events, transaction receipts, and digital bank signatures.

---

## 3. Threat Matrix & Adversary Personas

| Adversary Persona | Capability / Attack Vector | System Defense | Residual Risk |
|---|---|---|---|
| **Malicious NGO Insider** | Attempts to disburse escrowed grant funds to unapproved vendors or out-of-scope categories. | Smart contract checks `allowedCategoriesMask` and `authorizedCeilingMinor` during `executeRelease()`. Reverts if conditions fail. | Malicious insider could collide category tokens if hashing lacked salt; mitigated by fixed domain category definitions. |
| **Double-Claiming NGO (Cross-Grant)** | Submits the identical invoice receipt to Donor A and Donor B to double-collect project expenses. | `TrustFabricEscrow.sol` enforces global `expenseNullifierRegistry`. First claim registers nullifier; second claim triggers `AutomatedHoldTriggered` and reverts release. | Sybil attacks where vendor alters invoice number; mitigated by Normalized Field Duplicate Detection and Levenshtein clustering. |
| **Corrupt Field Auditor** | Colludes with NGO to sign false delivery attestations or unlock held tranches without remediation. | Decentralized escrow hold requires multisig or predeclared condition satisfaction; auditor cannot unilaterally clear on-chain nullifier collision. | False field attestation cannot be detected cryptographically if key is compromised; mitigated by requiring photographic GPS metadata. |
| **Surveillance State / Oppressor** | Monopolizes public blockchain logs to identify minority or refugee beneficiaries receiving foreign aid. | Zero PII on-chain. Field officer attestation uses `recipientOpaqueRef = sha256Hex('BENEFICIARY:' + salt + id)`. | If salt is low entropy or predictable, dictionary attack could unmask IDs. System requires 256-bit cryptographic salts. |
| **Front-Running / Replay Attacker** | Intercepts signed delivery attestation and replays it on another claim or milestone to siphon funds. | Attestations are canonically bound to `milestoneId`, `claimId`, and a cryptographic `nonce`. The contract and verifier track used nonces and reject replays. | None; nonce reuse is deterministically rejected. |
| **Adversarial Forger (Red-Team)** | Produces altered receipts with modified amounts, manipulated dates, or fake digital signatures (30% dataset). | Multi-stage detector (`redTeamEngine.ts`) evaluates byte SHA-256, canonical schema commitments, Ed25519 signature math, and duplicate nullifiers. | High-quality physical forgeries undetected by OCR; addressed by flagging low OCR confidence for human audit. |

---

## 4. Cryptographic Primitives & Design Tradeoffs

### 4.1 Canonical Commitments vs. Raw Hashes
- **Vulnerability:** Hashing raw JSON documents is non-deterministic due to whitespace variations, key ordering, and character encoding differences across clients.
- **TrustFabric Solution:** All commitments use **Schema v1.0 Canonical Strings**:
  ```
  SCHEMA:v1.0|VENDOR:<normalized>|INV:<token>|AMT:<integer_minor>|CURR:<iso_code>|DATE:<iso_date>
  ```
  This guarantees that field-identical claims yield the exact same SHA-256 digest regardless of frontend platform or whitespace.

### 4.2 Expense Nullifiers: Salted Hashes vs. Zero-Knowledge Proofs
- **Current Architecture (Salted Scoped Nullifiers):**
  $$\text{Nullifier} = H(\text{VendorNormalized} \parallel \text{InvoiceToken} \parallel \text{AmountMinor} \parallel \text{Salt})$$
- **Tradeoff Analysis:**
  - *Advantage:* Extremely fast, gas-efficient on EVM ($O(1)$ mapping lookup), easy to verify on resource-constrained devices and testnets.
  - *Limitation / Information Leakage:* If the salt is shared across grants to detect cross-donor duplicates, an attacker who guesses the vendor name and exact invoice number can test for the existence of that nullifier on-chain (dictionary attack).
  - *Future Zero-Knowledge Upgrade:* Using Poseidon hashes inside a Groth16 / Plonk zk-SNARK would allow an NGO to prove: *"I possess an invoice that does not collide with the Merkle accumulator of spent receipts, without revealing the invoice number or vendor."*

### 4.3 Ed25519 Delivery Attestations
- Field officers sign canonical delivery payloads containing milestone IDs and beneficiary opaque references.
- Signature verification uses Ed25519 with curve point validation, protecting against small-subgroup attacks and signature malleability.

---

## 5. Smart Contract Trust Assumptions & Privileged Roles

In compliance with PS 4.2 requirement *"prevent disputed escrow releases without depending on a centralized auditor to make each decision"*:

1. **No Admin "God Mode":** The smart contract `TrustFabricEscrow.sol` does NOT include an arbitrary `adminOverrideRelease()` function.
2. **Automated Freezing:** When a duplicate nullifier is detected, `AutomatedHoldTriggered` is emitted by the smart contract autonomously. No auditor signature is required to stop the money flow.
3. **Dispute Resolution Threshold:** A held tranche can only be transitioned back to `CONDITION_PENDING` after a cryptographically authenticated resolution payload signed by an accredited `AUDITOR` is submitted, and only if the underlying nullifier collision has been resolved.
4. **Oracle Assumptions:** For multi-chain bridge and fiat reconciliation, the system accepts attestations from configured chain providers and bank API signatures. If an external RPC is compromised or returns forged headers, local verification fails safe by marking the edge `UNRECONCILED`.

---

## 6. Access Control Matrix (Row-Level Security)

| Resource / Table | Anonymous | Authenticated Donor | Field Officer | Independent Auditor | NGO Finance Admin |
|---|---|---|---|---|---|
| `grants` | Read-Only (Public Metadata) | Read-Only (Funded Grants) | Read-Only | Read-Only | Full Access |
| `allocations` | Denied | Read-Only (Funded Grants) | Denied | Read-Only | Insert / Update |
| `claims` | Denied | Read-Only (Funded Grants) | Denied | Read-Only | Full Access |
| `evidence_documents` | Denied | Denied (Metadata Only) | Denied | Read (Signed URL) | Full Access (Signed URL) |
| `nullifier_registry` | Read-Only (Hashes Only) | Read-Only (Hashes Only) | Read-Only | Read-Only | Insert Only (Atomic) |
| `audit_events` | Denied | Read-Only | Denied | Full Read | Append Only (No Delete/Update) |

---

## 7. Operational & Residual Risks

1. **Testnet vs. Mainnet Gas Costs:** On public Ethereum L1, updating storage mappings for each receipt nullifier costs ~22,000 gas (~$1.50 at 30 gwei). In production, nullifiers should be settled on an L2 rollup (Arbitrum, Base, Polygon PoS) or aggregated in off-chain Merkle trees with on-chain root commitments.
2. **Bank API Deprecation / Consent:** Direct open banking feeds (PSD2 / Account Aggregator) require revocable user consent. When direct APIs are offline, CSV imports are restricted to `SOURCE_ATTESTED` only when cryptographic checksums or bank statements match.
3. **Key Management:** Private keys for field officers and NGO administrators must be stored in secure hardware enclaves (iOS Secure Enclave, Android Keystore) or WebAuthn Passkeys rather than raw browser localStorage.
