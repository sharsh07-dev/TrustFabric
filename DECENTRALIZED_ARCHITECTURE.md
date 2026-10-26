# TrustFabric: Decentralized Target Architecture & System Blueprint

## Executive Summary

TrustFabric has been re-architected from a traditional client-server web app backed by centralized intermediaries (Razorpay, Supabase, Clerk, and unencrypted IPFS) into a **resilient Web3 hybrid system**. Financial settlement, grant commitments, and execution proofs are anchored directly into public Ethereum consensus (Sepolia EVM testnet / Ethereum mainnet), while sensitive evidentiary documents are protected via **AES-256-GCM envelope encryption** prior to content-addressed IPFS dissemination.

This document details the target architectural topology, cryptographic invariants, and trust boundaries implemented across the codebase.

---

## 1. Architectural Topology Overview

```
                                +---------------------------------------------+
                                |               DONOR / CLIENT                |
                                |  - Self-Custody Wallet (MetaMask / Rabby)    |
                                |  - Direct Web3 RPC Queries (Ethers v6)      |
                                |  - Client-side EIP-4361 SIWE Signatures     |
                                +----------------------+----------------------+
                                                       |
                         +-----------------------------+-----------------------------+
                         |                                                           |
          Direct Web3 Settlement / Reads                              Authenticated API / Ingestion
                         |                                                           |
                         v                                                           v
+-------------------------------------------------+         +-------------------------------------------------+
|          ON-CHAIN CONSENSUS LAYER               |         |       DISPOSABLE INDEXER & RELAYER API          |
|  Contract: TrustFabric.sol (EVM)                |         |  - Node.js / Express / TypeScript Engine        |
|  - Direct Native ETH Donations                  |         |  - EIP-4361 SIWE Nonce & Replay Enforcement    |
|  - SafeERC20 Stablecoin Multi-Token Donations   |         |  - Reconstructable Chain Indexer (Logs Replay)  |
|  - Cryptographic Payment Commitment Anchoring   |         |  - AES-256-GCM Envelope Encryption Engine       |
|  - Batch Merkle Root Verification & Anchoring   |         |  - Rebuildable Read Caches (Zero-Trust)        |
+-------------------------------------------------+         +------------------------+------------------------+
                         ^                                                           |
                         | Anchors Merkle Roots                                      | Pins Encrypted Payloads
                         | & Fiat Commitments                                        |
+------------------------+------------------------+         +------------------------v------------------------+
|        CRYPTOGRAPHIC RELAYER WORKER             |         |     CONTENT-ADDRESSED EVIDENCE STORAGE          |
|  - Automated BullMQ / Local Processing Queue    |         |  - InterPlanetary File System (IPFS)            |
|  - Nonce-Managed EOA Signing Relayer            |         |  - CIDv0 / CIDv1 Multihash Addressability       |
|  - Strictly Submits Verified Off-Chain Batches  |         |  - Multiple Gateways (Pinata, ipfs.io, Cloudfl) |
|  - Cannot Forge Grants or Intercept Direct ETH  |         |  - Local Content-Addressed Vault Replica        |
+-------------------------------------------------+         +-------------------------------------------------+
```

---

## 2. Core Architectural Pillars

### 2.1 On-Chain Financial Settlement Core
- **Native ETH Donations (`donate`)**:
  - Donors interact directly with `TrustFabric.sol` from self-custody wallets.
  - Funds are forwarded atomically via low-level `.call{value: msg.value}("")` to the campaign recipient, accompanied by non-reentrancy locks (`nonReentrant`).
  - Contract accounting maintains immutable campaign tallies (`campaigns[campaignId].totalDonatedWei`).
  - No backend server or payment processor can intercept, freeze, or skim funds.
- **ERC-20 Stablecoin Donations (`donateToken`)**:
  - Donors approve and donate allowlisted ERC-20 tokens (e.g. USDT, USDC, DAI).
  - Uses `_safeTransferFrom` using low-level function selectors (`0x23b872dd`) to handle non-compliant ERC-20 tokens (tokens that do not return a boolean on success, like legacy USDT).
  - Enforces `allowedTokens[token] == true` allowlisting controlled by contract governance.
- **Audit Anchoring (`recordFiatDonation` & `recordBatchMerkleRoot`)**:
  - Used for auditable zero-fee bank donations (NEFT/RTGS/UPI) and expense claim verification.
  - Off-chain UTR reference hashes and Merkle roots are committed into contract state for public verification.

### 2.2 Decentralized Identity & Access Control (SIWE)
- Centralized proprietary authentication (Clerk) has been augmented with **Sign-In with Ethereum (EIP-4361 / SIWE)**:
  - Cryptographically secure 16-byte random challenge nonces with strict 5-minute time-to-live (TTL).
  - Domain, URI, and chain ID binding preventing man-in-the-middle phishing attacks.
  - Strict anti-replay: nonces are deleted immediately upon initial verification.
  - Explicit role separation: A wallet signature proves key ownership, not real-world NGO legitimacy. Elevated roles (`ADMIN`, `AUDITOR`) require explicit governance allowlisting, preventing any arbitrary wallet from claiming administrative privileges.

### 2.3 Resilient and Private Evidence Storage
- **Public IPFS Privacy Leakage Remediation**:
  - Raw invoices, PAN cards, and bank details are **never posted unencrypted to public IPFS gateways**.
  - All sensitive evidence buffers are wrapped in an **AES-256-GCM envelope** before IPFS CID generation.
  - Each document generates an ephemeral 32-byte Data Encryption Key (DEK), which is wrapped with an authorized Key Encryption Key (KEK).
  - Public IPFS nodes only host high-entropy ciphertext; decryption requires authorized keys and role-based clearance.
- **High Availability Storage**:
  - Multi-gateway retrieval fallback (`gateway.pinata.cloud`, `ipfs.io`, `cloudflare-ipfs.com`, `dweb.link`).
  - Local content-addressed fallback vault `.evidence_vault/ipfs/` ensuring zero downtime during upstream gateway outages.

### 2.4 Disposable Reconstructable Event Indexer
- The application eliminates hard dependence on persistent relational database records for critical verification:
  - `ChainIndexerService` can reconstruct campaign summaries, donation histories, and Merkle root registries from scratch by replaying on-chain logs (`DonationReceived`, `TokenDonationReceived`, `MerkleBatchAnchored`).
  - If the database is dropped or corrupted, the entire public ledger state is deterministic and rebuildable from the blockchain.
  - In-memory database fallback is strictly disabled in production mode (`NODE_ENV === 'production'`) to guarantee that operators configure persistent PostgreSQL or rely directly on on-chain indexing.

---

## 3. Component Interaction Matrix

| Subsystem | Primary Rail | Fallback Rail | Authoritative Source of Truth |
| :--- | :--- | :--- | :--- |
| **Crypto Donations** | Direct EVM Web3 Wallet | N/A | Ethereum Blockchain Consensus |
| **Fiat Donations** | Direct Bank Transfer (UTR Nullifier) | Legacy Razorpay Sandbox | Bank Clearinghouse + On-Chain Anchored Salted Hash |
| **Authentication** | EIP-4361 SIWE Wallet | Signed JWT / Clerk | Cryptographic Key Signature + Governance Allowlist |
| **Document Storage** | Envelope-Encrypted IPFS (Pinata) | Local Content-Addressed Vault | Cryptographic Content-ID (CIDv1 / Multihash) |
| **Audit Ledger** | On-Chain Event Logs | Ephemeral PostgreSQL Index | Smart Contract Log Topics |
| **Expense Verification**| Merkle Proof against On-Chain Root| Local Merkle Tree Cache | Contract `verifyMerkleProof` |
