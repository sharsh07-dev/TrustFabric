# TrustFabric — Remaining Features Implementation Plan
**CASCADE '26 Theme 4, Problem 4.2: "The Black Hole Ledger: Verifiable NGO Fund Flows"**

---

## 1. Codebase Audit & Gap Analysis

| Official PS 4.2 Requirement | Current Status | Identified Gap | Action Plan |
|---|---|---|---|
| **P0: Decentralized Escrow Enforcement** | Simulated in `EscrowStateMachine.ts`; AidFlow Soroban contracts present in `smart ledger/contracts` but Cargo/Rust/Soroban CLI are absent from system. | Contract release cannot be enforced on-chain; release denial on duplicate collision currently runs only in browser memory. | 1. Implement Solidity EVM Escrow contract (`TrustFabricEscrow.sol`) supporting purpose-bound gates, nullifier uniqueness, delivery Ed25519 signatures, and automated freeze.<br>2. Build contract verification test suite with exhaustive negative tests (duplicate nullifier, wrong purpose, replay, over-budget).<br>3. Build frontend `ContractEscrowService` connecting to RPC with fallback. |
| **P0: Shared Server Persistence & Auth** | Browser `localStorage` (`TrustFabricStorage.ts`). | State is isolated to one browser; unauthorized client can mutate local state; no row-level security or atomic DB transactions. | 1. Implement comprehensive PostgreSQL/Supabase schema migration with RLS policies, table constraints, and atomic stored procedures.<br>2. Implement `ServerStorageService` with live Supabase client + safe local fallback.<br>3. Provide one-time export/migration tool. |
| **P0: 30%-Forged Receipt Benchmark** | Deterministic generator in `redTeamEngine.ts` & UI. | Need standalone reproducible CLI/script evaluation outputting machine-readable JSON/CSV reports, blind scoring against ground truth, and comprehensive confusion matrix. | 1. Harden `RedTeamEngine` with versioned seed (`2026042`), exactly 30 forged records, and blind scoring.<br>2. Add script `scripts/evaluate-redteam.ts` outputting `redteam_benchmark_results.json`.<br>3. Ensure Vitest tests fail if detector is disconnected from ground truth. |
| **P0: Privacy, Delivery Proofs & Ed25519** | Implemented in `deliveryProof.ts` & `crypto.ts`. | Need complete cryptographic negative tests (wrong key, modified payload, replayed nonce) and explicit threat model for beneficiary privacy and nullifiers. | 1. Add negative test cases for Ed25519 signature tamper, cross-grant replay, and expired nonces.<br>2. Document privacy model and residual linkage risks. |
| **P1: Real On-Chain Ingestion** | Ingestion structure in `chainAdapter.ts` currently marked `SIMULATED`. | Ingestion does not query real JSON-RPC endpoint for canonical receipts, block confirmations, or log events. | 1. Implement real Ethereum JSON-RPC client (Sepolia testnet compatible) fetching receipts, confirmations, and log topics.<br>2. Support `ON_CHAIN_VERIFIED`, `SOURCE_ATTESTED`, `UNVERIFIED`, and `SIMULATED` statuses. |
| **P1: Multi-Hop Reconciliations & Fiat** | `fiatAdapter.ts` and `bridgeSwapAdapter.ts` exist. | Lacks CSV statement import parser, fee/slippage calculation, and explicit unreconciled residual tracking. | 1. Add CSV bank statement parser with schema validation, statement reference check, and duplicate line detection.<br>2. Explicitly compute exchange rate fees, slippage, and residual unreconciled balances. |
| **P1: OCR & Document Ingestion** | Simulated OCR with manual fallback. | Real OCR text extraction pipeline needed, with confidence tagging and clear distinction of OCR vs user-entered data. | 1. Implement OCR processing pipeline (Tesseract-compatible/canvas extraction) with bounding confidence scores.<br>2. Tag fields with `OCR_EXTRACTED` vs `USER_ENTERED`. |
| **P1: Independent Verification CLI** | Not present (only browser UI). | Auditor cannot independently verify an exported audit bundle from terminal without opening web dashboard. | 1. Build standalone executable `bin/trustfabric-verify` in Node.js.<br>2. Validates SHA-256 chain links, document hashes, Ed25519 signatures, nullifier uniqueness, and exits nonzero on tamper. |
| **P1: UI & Reporting Updates** | Overview, Grants, Findings, Disbursements, Audit refined. | Need Integration Health/Settings screen, exportable audit packages, and reconciliation breakdown. | 1. Add `SettingsHealthView.tsx` with RPC/DB health checks (no secrets exposed).<br>2. Add export audit package feature in Audit Trail screen. |
| **P2: Hardening & Production Readiness** | Core business logic tested. | Security threat model, concurrency tests for nullifiers and budget allocation, security headers. | 1. Write `SECURITY_THREAT_MODEL.md`.<br>2. Implement concurrency stress tests for nullifier collision and over-allocation. |

---

## 2. Implementation Execution Order

- **Phase 2 (P0):**
  1. EVM Smart Contract (`TrustFabricEscrow.sol`) & Contract Test Suite
  2. Frontend Contract Adapter (`contractEscrowService.ts`)
  3. Server-backed PostgreSQL/Supabase Migrations & `ServerStorageService`
  4. Red-Team 30%-Forged Benchmark Script & Evaluation Suite
  5. Cryptographic Ed25519 & Privacy Negative Tests

- **Phase 3 (P1):**
  1. Live JSON-RPC Chain Ingestion Adapter
  2. Fiat Statement CSV Parser & Reconciliation Graph
  3. OCR Extraction Pipeline with Confidence Tags

- **Phase 4 (P1):**
  1. Standalone Auditor Verification CLI (`bin/trustfabric-verify`)

- **Phase 5 (P1 & P2):**
  1. Settings & Integration Health View
  2. Full Test Suite Execution, Build Verification, and Benchmarks

- **Phase 6:**
  1. Final Implementation Report (`REMAINING_FEATURES_IMPLEMENTATION_REPORT.md`)
