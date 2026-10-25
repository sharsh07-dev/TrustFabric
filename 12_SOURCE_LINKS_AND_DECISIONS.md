# Source Links and Architecture Decisions

## Source-derived challenge requirements

Primary source: `CASCADE26_Problem_Statements_Reflowed.pdf`, Theme 4, Problem 2, page 13 (“The Black Hole Ledger: Verifiable NGO Fund Flows”). Read this exact page whenever scope is in doubt. Requirements are mapped into PS42-R01–PS42-R20 in `01_SOURCE_REQUIREMENTS_TRACEABILITY.md`.

## Public TCS Quartz references

- Official Quartz overview: https://www.tcs.com/what-we-do/products-platforms/quartz
- Smart Solutions: https://www.tcs.com/what-we-do/products-platforms/quartz/solution/quartz-smart-solutions-dlt-friendly-ready-to-use
- Gateway: https://www.tcs.com/what-we-do/products-platforms/quartz/solution/quartz-gateway-command-center-reinvent-business-roadmap
- DevKit: https://www.tcs.com/what-we-do/products-platforms/quartz/solution/quartz-devkit-blockchain-app-development-kit

The public material describes coexistence of on-chain services and off-chain conventional systems, domain/business-aware contracts, REST integration, DLT interoperability, access control, privacy, audit and logging. TrustFabric may adopt analogous patterns independently. Do not claim that the public pages prove a specific private implementation or feature gap.

## AidFlow public repository

- https://github.com/Aid-flow/Aidflow

The repository publicly describes a Stellar/Soroban protocol with modular contracts for pooling, beneficiary registry, distribution, milestones and audit, plus a TypeScript SDK. Inspect the current code and license before use. Its README roadmaps fraud/anomaly detection, cross-campaign duplicate detection, privacy/ZK identity features and security hardening as future work; do not assume those are implemented.

## Decisions

- `ADR-001`: Keep TrustFabric's grant, evidence, duplicate, discrepancy, reporting and audit core independent of AidFlow.
- `ADR-002`: Treat AidFlow as an optional adapter; do not require deployed contracts for local development.
- `ADR-003`: Store raw documents and PII off-chain in private storage; store only opaque commitments/proofs and necessary minimal metadata on public chain.
- `ADR-004`: Separate document integrity, issuer authenticity, payment reconciliation, delivery attestation and impact verification statuses.
- `ADR-005`: A mandatory duplicate conflict must make the affected tranche non-releasable under deterministic protocol/contract rules; application-only hold is a pilot approximation, not a real escrow freeze.
- `ADR-006`: Multi-chain, bridge and fiat relations require provenance; no amount-only guessed linkage.
- `ADR-007`: Use privacy-preserving expense nullifiers for production. Any MVP token/hash scheme must describe centralized trust and correlation leakage.
- `ADR-008`: Do not claim an arbitrary physical-world delivery is proven by a hash. A signature/commitment verifies the attestation; truth also depends on the attestor/source model.
- `ADR-009`: Synthetic red-team outcomes are not real-world accuracy claims.
- `ADR-010`: The interface should look like a human-designed finance/compliance workspace, not generic AI marketing software.
