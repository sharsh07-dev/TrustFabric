# 24-hour Pilot vs. Full PS Conformance vs. Production Readiness

## 1. Three different claims

Do not confuse these milestones:

1. **Demo-complete:** the main scenarios run against real application code and clearly labeled synthetic fixtures.
2. **PS-conformance-complete:** every mandatory requirement has a real implementation and passing evidence, including actual chain/fiat adapters, privacy-preserving duplicate proof, delivery-proof verification, and contract-enforced hold semantics.
3. **Production-ready:** code/contract security reviewed, source providers and operations validated, privacy/legal obligations addressed, monitoring/backups run, and actual payment/escrow integrations approved.

A successful demonstration does not automatically establish the second or third milestone.

## 2. Realistic 24-hour scope

Likely attainable for a focused single-developer or small-team pilot, depending on environment:

- Grant/transaction/evidence application with real database persistence.
- Private receipt upload, server-side hash and normalized-field matching.
- Exact duplicate and configured likely-duplicate rules.
- Deterministic category/report discrepancy findings.
- Application-level `ON_HOLD` state and release denial.
- Synthetic 30%-forged dataset and reproducible evaluation.
- Signed test delivery statement verification using a standard library.
- Reconciliation views over fixture-based multi-chain/bridge/swap/fiat events.
- Donor-safe API projection and basic access tests.
- Human-designed UI, README and deployment build.

These can be completed if the stack and integrations cooperate; they are not guaranteed.

## 3. Usually not honestly complete in 24 hours without pre-existing components

- Production adapters for several live chains, bridges, exchanges and banks.
- Robust bridge lineage across arbitrary protocols and chain reorganizations.
- Full privacy-preserving cross-donor uniqueness using audited zero-knowledge proofs.
- Audited decentralized escrow contract with a secure dispute protocol.
- Independent real-world authenticity verification for every receipt.
- Proof that a physical deliverable occurred, beyond cryptographic attestation by a trusted signer/source.
- Production key custody, institutional onboarding, legal compliance, incident response and disaster recovery.
- Independent smart-contract audit and formal verification.

Represent these as `PARTIAL`, `SIMULATED`, `BLOCKED` or `NOT IMPLEMENTED` until tested.

## 4. Minimum real-money gate

Do not handle real donations or release real funds until:

- contract code is independently reviewed/audited;
- admin/attestor/key compromise is addressed;
- contract authorization, reentrancy/replay/race/finality behavior is tested;
- chain and fiat sources have known provenance and reconciliation controls;
- privacy nullifier strategy has been reviewed for correlation and dictionary leakage;
- donor/admin access controls and document storage are security-tested;
- backup/restore, monitoring, incident response and key recovery are defined;
- dispute/appeal process and legal/regulatory requirements are addressed;
- all production acceptance tests pass against real integrations.

## 5. Final coverage report format

| Requirement | Status | Implementation evidence | Test evidence | Remaining risk |
|---|---|---|---|---|
| PS42-R01 ... PS42-R20 | IMPLEMENTED / PARTIAL / SIMULATED / BLOCKED / NOT IMPLEMENTED | file/function/contract/API | test name/output | explicit limitation |

Do not put `PASS` based on visual appearance. For production chain/fiat items, list transaction hashes, provider references and test network where available. Keep test fixture IDs visibly separate from real IDs.
