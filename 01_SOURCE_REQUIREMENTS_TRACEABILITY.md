# Source Requirements & Traceability — CASCADE '26 PS 4.2

## 1. Source framing

The official statement is titled **“The Black Hole Ledger: Verifiable NGO Fund Flows”** under Theme 4, Problem 2. It describes disconnected donations, financial transactions, expense records, and self-published impact metrics. The required system is a decentralized donation-tracking system that links donated funds, authorized spending, and supporting evidence while protecting beneficiary-sensitive information.

The source gives a multi-hop example: a 50 ETH donation earmarked for water infrastructure is swapped, bridged, and supposedly spent off-chain through local fiat vendors. It requires a traceable and verifiable timeline of impact.

The source explicitly requires:

- Purpose-bound allocation using smart contracts to manage earmarked funds and enforce agreed disbursement conditions.
- Verifiable expenditure records linking outgoing on-chain transactions to off-chain invoices/receipts using cryptographic commitments.
- Privacy protection that shields beneficiary identities and sensitive documents from the public blockchain while maintaining mathematical proof of delivery.
- Discrepancy detection for unexplained transfers, spending outside declared categories, and inconsistencies between published reports and recorded transactions.
- Tracking across multiple chains and off-chain fiat off-ramps.
- Resilience to an adversarial NGO that double-counts one piece of off-chain expenditure evidence across multiple donor reports and deliberately forges 30% of receipts.
- Cryptographic duplicate detection and escrow-disbursement freezing without relying on a centralized auditor.
- Probabilistic evaluation chain: inbound donation → escrow condition → off-chain invoice proof → cryptographic impact verification.

## 2. Requirement IDs and acceptance interpretation

| ID | Source requirement | Implementation must demonstrate | Evidence / acceptance test |
|---|---|---|---|
| PS42-R01 | Auditable connection among donations, authorized spending and evidence | Every grant, allocation, transfer, expense claim, receipt and delivery/impact claim is linked by stable IDs and queryable relationships | Trace a donation to its final claim and supporting records; flag missing links |
| PS42-R02 | Decentralized donation tracking | Use a ledger/contract or decentralized-verifiable protocol for critical allocation, evidence commitment, and release state; avoid a human auditor as the sole control point | Demonstrate contract or independently verifiable proof path; clearly label any simulation |
| PS42-R03 | Purpose-bound allocation | Grant defines purpose, amount, allowed categories, beneficiary/project scope, milestones and release conditions | Contract/rule tests reject over-allocation, unauthorized category and unmet-milestone release |
| PS42-R04 | Smart-contract enforcement | Release eligibility and holds are enforced by contract logic or a clearly isolated policy engine in the demo; production design must enforce critical escrow rules on-chain | Attempt release under invalid conditions and assert rejection/hold |
| PS42-R05 | On-chain transfer linked to off-chain invoice/receipt via cryptographic commitment | Store documents off-chain; compute canonical commitment; record a commitment and claim relation; verify commitment on read | Upload document, verify its digest/commitment, change file and prove mismatch |
| PS42-R06 | Beneficiary privacy | Do not place beneficiary names, addresses, health/financial details or raw documents on a public chain; restrict off-chain records and expose only minimal proofs | Test roles/API payloads/storage policies; inspect public event data for PII |
| PS42-R07 | Mathematical proof of delivery | Use a signed delivery attestation or verifiable receipt, commitment/Merkle inclusion proof and cryptographic signature validation; explain the trust root of attestations | Change the signed payload or proof and assert verification failure; describe what the proof does and does not prove |
| PS42-R08 | Detect unexplained transfers | Reconcile expected edges, declared source/destination, amount, fees, currency conversion and observed transaction/source events | Inject a transfer that cannot be connected to an authorized allocation and verify a discrepancy finding |
| PS42-R09 | Detect spending outside categories | Compare expense category, amount and project scope with allocation policy | Inject out-of-scope vendor expense and assert finding and release hold |
| PS42-R10 | Detect report/transaction inconsistencies | Calculate report totals from ledger/evidence sources and compare with published claims; never trust the NGO's report total alone | Submit a report whose total does not match underlying claims and flag difference |
| PS42-R11 | Multi-chain flow tracking | Define chain adapters with chain ID, transaction/block reference, confirmation/finality state, asset, amount and provenance; deduplicate event ingestion and handle reorgs where relevant | Replay fixtures for two separate chains; reconcile multi-hop edges and test duplicate event ingestion |
| PS42-R12 | Bridges and swaps | Model bridge lock/burn, destination mint/release, swap input/output, fee, exchange rate and proof/source references; uncertain mappings remain unverified | Simulated or testnet multi-hop path shows lineage; missing bridge evidence is flagged, not guessed |
| PS42-R13 | Off-chain fiat off-ramps | Ingest bank/payment-provider statement/API or signed fiat attestation, match it to off-ramp/merchant invoice, record source evidence and confidence | Import a test statement or signed fixture; show mismatch or missing fiat confirmation |
| PS42-R14 | Double-counting one expenditure across multiple donor reports | Maintain a cross-report expense-identity registry; detect exact document reuse and normalized-claim reuse; duplicate claims cannot become release-eligible | Reuse an invoice in two claims/grants and confirm the second claim gets linked to the first and is blocked/held by policy |
| PS42-R15 | 30% forged receipt adversary | Build a labeled adversarial dataset in which 30% of receipts are forged/altered; verify signatures/issuer evidence and detect deterministic tampering/inconsistencies; report precision/recall and false positives | Red-team suite with reproducible seeded data and ground-truth labels; do not claim general real-world detection from synthetic scores |
| PS42-R16 | Cryptographic duplicate detection | Use a stable expense nullifier/commitment with a privacy model that prevents publication of raw invoice/beneficiary data; explain equality-linkability trade-offs | Same normalized expense maps to same duplicate key within the defined scope and a contract/registry rejects or flags reuse |
| PS42-R17 | Freeze escrow without centralized auditor | Contract/ledger rule blocks disputed tranche automatically when a valid duplicate proof/nullifier conflict or mandatory deterministic violation is recorded; a human review may resolve later but must not be the only detector | A fresh duplicate claim triggers contract/policy state `ON_HOLD`; attempted release is rejected; no centralized person must click “freeze” |
| PS42-R18 | Traceable, verifiable timeline of impact | Append time-stamped, provenance-tagged events from inbound donation to off-chain invoice proof and delivery/impact attestation | Timeline identifies source, status, proof reference and confidence for every hop |
| PS42-R19 | Probabilistic evaluation chain | Model donation intake, escrow condition, invoice evidence and cryptographic impact verification as distinct stages with explicit states | A claim cannot jump from “invoice uploaded” to “impact verified” without the required proof chain |
| PS42-R20 | Explain uncertainty and incomplete data | Preserve unknown/partial/unverified states; don't invent bridge links, vendor confirmations or impact outcomes | Remove one source event; UI shows an incomplete trail and the reason rather than silently assuming success |

## 3. Critical distinctions

### What a cryptographic hash proves

A valid hash/commitment can show that the same bytes or canonicalized claim were previously committed and that a payload matches a recorded commitment. It does **not**, on its own, prove that the document is genuine, that an invoice issuer exists, that payment occurred, or that a physical project was completed.

### What proves delivery

TrustFabric must define a proof-of-delivery trust model. At minimum, a delivery claim should contain a canonical statement, a signer/credential or trusted attestation source, a signature, a timestamp/nonce to prevent replay, and a cryptographic commitment. Validate the signature and inclusion proof. The app must state that the proof establishes who attested to what and that the attestation was not altered; it cannot independently prove physical reality if all signers or sensors collude.

### Privacy and duplicate detection

A plain hash of an invoice number/vendor/amount tuple may be guessable and reveal equality across donors. Do not put raw PII or low-entropy unkeyed invoice fields on a public chain. Define a privacy-aware expense nullifier strategy (e.g., hiding commitment plus zero-knowledge equality/uniqueness proof, or a carefully scoped keyed/attested token for the pilot). Document the trust and linkability trade-offs. The system must not falsely claim full zero-knowledge privacy unless an actual proof circuit and verifier are implemented and tested.

### “No centralized auditor”

This means a central human auditor must not be the sole party that detects a duplicate and triggers a hold. It does not mean the system has no trust assumptions. Use deterministic smart-contract enforcement and verifiable proofs/attestations. For off-chain document analysis, disclose which processing components are centralized and prevent their decisions alone from being treated as cryptographic proof.

## 4. Required traceability matrix in the implementation

Every requirement above must map to:

1. One or more code modules/files.
2. One or more API/contract functions.
3. One or more automated tests.
4. One UI view/state that exposes the result.
5. One documented limitation or trust assumption where applicable.

The coding agent must add a final coverage table showing `IMPLEMENTED`, `PARTIAL`, `SIMULATED`, or `NOT IMPLEMENTED`, each with evidence. It may not mark a requirement complete just because a UI component exists.
