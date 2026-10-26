# TrustFabric: Data Migration Map & State Topology

## Overview

This document defines the authoritative data mapping for all TrustFabric data entities as the platform transitions from a centralized PostgreSQL / Supabase storage model to a decentralized, cryptographic architecture. 

Each existing table, schema entity, and query pattern is categorized by its target storage layer, authoritative source of truth, and integrity reconstruction method.

---

## 1. Storage Classification Tiers

1. **On-Chain Consensus State (Ethereum / EVM)**:
   - Data requiring decentralized consensus, tamper resistance, and autonomous execution.
   - Financial totals, campaign states, contract permissions, payment commitments, and Merkle root anchors.
2. **Content-Addressed Decentralized Storage (IPFS)**:
   - Large immutable artifacts, audit bundles, Batch Manifests, and OCR extraction summaries.
   - Identified by multihash CIDs (CIDv0 / CIDv1).
3. **Encrypted Private Storage (Envelope AES-256-GCM + IPFS / Local Vault)**:
   - Confidential evidence, invoices containing PAN/GSTIN, bank account details, and NGO registration certificates.
   - Ciphertext stored publicly on IPFS; decryption keys restricted to authorized roles.
4. **Disposable Reconstructable Index (PostgreSQL / Local Cache)**:
   - Read-optimized projections and search caches derived deterministically from on-chain event logs and IPFS manifests.
   - Can be completely wiped and re-indexed at any time with zero loss of state.
5. **Legacy Read-Only Archive**:
   - Historical Razorpay payment transactions, webhooks, and legacy order IDs preserved for legal and financial audit continuity.

---

## 2. Table-by-Table Data Migration Map

| Existing Entity / Table | Current Centralized Schema | Target Destination | Authoritative Source of Truth | Verification & Reconstruction Scheme |
| :--- | :--- | :--- | :--- | :--- |
| **`Campaigns`** | `campaign_id`, `recipient`, `title`, `is_active`, `total_donated_wei` in Postgres | **On-Chain (`TrustFabric.sol`)** + Indexer Cache | Smart Contract Storage (`campaigns` mapping) | Query `getCampaign(campaignId)` on-chain. Indexer replays `CampaignRegistered` & `DonationReceived`. |
| **`EthDonations`** | `tx_hash`, `donor_address`, `campaign_id`, `amount_wei`, `block_number` | **On-Chain Event Logs** + Indexer Cache | EVM Blockchain Transaction Logs | Replay `DonationReceived(donor, campaignId, recipient, amountWei)` logs via `ChainIndexerService`. |
| **`TokenDonations`** | N/A (New Feature) | **On-Chain Event Logs** + Indexer Cache | EVM Blockchain Transaction Logs | Replay `TokenDonationReceived(donor, campaignId, recipient, token, amount)`. |
| **`PaymentAnchors`** | `payment_commitment`, `grant_ref_hash`, `amount_paise`, `currency_code` | **On-Chain (`TrustFabric.sol`)** | Smart Contract Storage (`anchors` mapping) | Query `getAnchor(commitment)` or replay `FiatDonationAnchored` logs. |
| **`MerkleBatches`** | `batch_id`, `merkle_root`, `leaf_count`, `manifest_hash` | **On-Chain Root** + **IPFS Manifest** | Smart Contract (`batches` mapping) & IPFS CID | Verify root via `getBatch(batchId)`; fetch JSON manifest from IPFS and recompute Merkle root. |
| **`EvidenceFiles`** | Raw PDF/PNG files stored in Supabase Storage bucket | **Envelope-Encrypted IPFS** | IPFS Multihash CID + SHA-256 Digest | Fetch encrypted ciphertext from IPFS; verify SHA-256; decrypt with authorized DEK/KEK. |
| **`ExpenseClaims`** | Invoices, claim codes, vendor names, nullifiers in Postgres | **Merkle Batch Leaf** + Disposable Index | Merkle Batch on IPFS anchored to EVM Root | Merkle leaf hash `keccak256(claimCode, nullifier, sha256)`. Verify on-chain via `verifyMerkleProof`. |
| **`BankDonations (Direct)`** | N/A (New Feature) | **On-Chain Anchor** + Reconstructable Index | Bank Statement UTR + On-Chain Anchored Salted Hash | Salted commitment `keccak256(utr, amount, salt)` anchored via `recordFiatDonation`. |
| **`Users & Personas`** | `users` table in Postgres + Clerk User IDs | **SIWE Wallet Registry** (Decentralized) + Governance Allowlist | Cryptographic Key Pairs (EIP-4361) | Cryptographic signature recovery via `ethers.verifyMessage`. Roles verified against contract/governance registry. |
| **`LegacyRazorpayOrders`**| `razorpay_order_id`, `payment_id`, `signature` | **Read-Only Postgres Archive** | Historical Database Records | Immutable read-only view; never modified or relabeled as crypto. |

---

## 3. Migration Verification and Integrity Rules

### 3.1 Referential Integrity
- Any entity referencing a `grantId` or `campaignId` must resolve to an on-chain `bytes32` identifier created via `registerCampaign`.
- Nullifier hashes (`bankReferenceUtr` or expense claim hash) enforce single-use idempotency across both off-chain caches and on-chain batch leaves.

### 3.2 Dual-Write Elimination
- In the migrated architecture, write operations do **not** write to PostgreSQL first and then asynchronously sync to the chain.
- For Web3 operations, the **blockchain is the primary write target**. Once mined, the event listener or client indexer populates the read cache.
- For zero-fee bank donations, the database records the intent, but the donation is not marked `ANCHORED` until the transaction receipt from `recordFiatDonation` is confirmed on-chain.

### 3.3 Reconstruction Runbook
If the local PostgreSQL database or cache is destroyed:
1. Initialize a blank cache: `npm run db:reset`.
2. Connect `ChainIndexerService` to an Ethereum RPC provider (or local Ganache node).
3. Execute `rebuildIndexFromLogs(fromBlock, toBlock)`.
4. Scan IPFS for all batch manifests matching indexed `MerkleBatchAnchored` events.
5. The complete campaign state, token balances, expense verification roots, and donation ledgers are fully restored.
