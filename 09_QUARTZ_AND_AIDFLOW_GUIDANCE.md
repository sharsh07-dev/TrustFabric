# Quartz & AidFlow Guidance

## 1. TCS Quartz: use public architectural ideas, not proprietary internals

TCS's public Quartz pages describe a portfolio combining distributed ledger technology and conventional systems, business-aware smart contracts, integration through a REST-based gateway, platform/interoperability capabilities, privacy/access controls, audit trails, logging, and reporting. The useful design lesson is **coexistence**: do not put every document and every operation on-chain. Use conventional databases/files where appropriate and ledger contracts for selected commitments, rules and verifiable state transitions.

Public references:

- Quartz overview: https://www.tcs.com/what-we-do/products-platforms/quartz
- Quartz Smart Solutions: https://www.tcs.com/what-we-do/products-platforms/quartz/solution/quartz-smart-solutions-dlt-friendly-ready-to-use
- Quartz Gateway: https://www.tcs.com/what-we-do/products-platforms/quartz/solution/quartz-gateway-command-center-reinvent-business-roadmap
- Quartz DevKit: https://www.tcs.com/what-we-do/products-platforms/quartz/solution/quartz-devkit-blockchain-app-development-kit

Do not claim TrustFabric is Quartz, is officially endorsed by TCS, or reproduces private Quartz source code. Do not claim a missing feature exists in Quartz because it is absent from a public page. Position TrustFabric as an independently proposed, domain-specific application that could integrate with enterprise DLT infrastructure.

## 2. AidFlow: optional base for part of the fund-distribution layer

Upstream candidate: https://github.com/Aid-flow/Aidflow

The public README describes a modular Stellar/Soroban aid distribution protocol with contracts for fund pool, beneficiary registry, distribution, milestone engine and audit/tracking, plus a TypeScript SDK. It also lists some fraud-prevention, cross-campaign duplicate detection, formal verification and security hardening items in its roadmap rather than demonstrating that all are implemented. Verify the current source, tests, license and compatibility before integration.

Recommended use:

- Keep AidFlow as a separate adapter/module (`integrations/aidflow/`).
- Inspect contracts and tests, build them locally, and confirm exact SDK APIs before depending on them.
- Reuse only components whose behavior fits the trust model and license.
- Do not assume a general milestone flag handles duplicate receipts, cross-donor evidence uniqueness, fiat reconciliation or a privacy-preserving duplicate proof.
- Add TrustFabric's evidence/duplicate/reconciliation modules independently.
- Do not force the web app to depend on deployed AidFlow contracts just to start in local dev.
- If deployed to Stellar testnet, label network, contract IDs, transaction hashes and finality correctly. Never use production funds for the demo.

## 3. Capability split

| Capability | Potential AidFlow contribution | TrustFabric responsibility |
|---|---|---|
| Donations/fund pool | Contract may accept/record funds | Chain adapter, provenance and source verification |
| Allocation | Contract may record allocation | Purpose/category policy, complete traceability and reconciliation |
| Milestones | Contract may support conditions/manual approval | Cryptographic delivery attestation and proof model |
| Audit events | Contract may emit/log events | Correlate on-chain events with off-chain claims/evidence |
| Receipt hashing/verification | Not assumed | Evidence service and issuer/payment validation |
| Cross-donor duplicate claims | Do not assume implemented | Expense nullifier registry and duplicate engine |
| 30% forged receipt test | Not assumed | Adversarial dataset, signature/field checks and metrics |
| Multi-chain + fiat off-ramp | Stellar base alone does not establish full support | Explicit chain, bridge/swap and fiat adapters |
| Beneficiary privacy/proof of delivery | Must be checked; don't assume ZK | Privacy projection, signed proofs and leak tests |
| Escrow hold without auditor | Check exact contract behavior | Automated uniqueness/condition checks with a contract-enforced release denial |

## 4. Selection rule

If AidFlow fails build/tests, its license is unsuitable, or the required escrow behavior cannot be safely extended, keep it as a reference only. Do not risk the core TrustFabric pilot by blindly importing an unverified contract. Build an adapter abstraction first and select the contract path based on test results.
