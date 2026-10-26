# TrustFabric: Decentralization Scorecard & Trust Assessment

## Overview

This scorecard provides a rigorous, component-by-component evaluation of TrustFabric's architecture following the Stage A–E decentralization migration. In accordance with zero-trust engineering standards, we avoid arbitrary "percentages" and instead evaluate the exact trust assumptions, single points of failure (SPOFs), censorship risks, verification mechanisms, and remaining centralized dependencies for each architectural layer.

---

## Component Evaluation Matrix

### 1. Payment Settlement Layer

- **Classification**: Hybrid (Decentralized On-Chain Core + Explicit Auditable Fiat Rail + Optional Legacy Sandbox).
- **Current Implementation**:
  - **Primary**: Direct Native ETH (`donate`) and ERC-20 (`donateToken`) smart contract transfers directly between donor wallet and registered campaign recipient.
  - **Secondary**: Direct Bank Transfer (NEFT/RTGS/UPI) with bank UTR nullifier hashing and on-chain anchoring.
  - **Legacy**: Optional on-demand Razorpay sandbox checkout.
- **Who Controls It**:
  - Crypto: Autonomous Ethereum smart contract `TrustFabric.sol` and EVM consensus.
  - Bank: Reserve Bank of India (RBI) / clearing banks for rupee settlement; TrustFabric relayer for on-chain UTR anchoring.
  - Razorpay: Centralized payment gateway operator (Razorpay Software Pvt. Ltd.).
- **Can One Operator Censor It?**:
  - Crypto: **No**. Transactions submitted via self-custody wallets directly to the mempool cannot be censored by TrustFabric operators.
  - Bank: Clearing banks can freeze bank accounts; TrustFabric operator cannot fabricate UTR anchors without bank confirmation.
  - Razorpay: **Yes**. Razorpay can disable merchant accounts or block specific cards/VPIs.
- **Single Point of Failure (SPOF)**:
  - Crypto: Public RPC endpoint (mitigated via multi-RPC fallback in `chainIndexerService.ts`).
  - Bank: Commercial banking clearing network.
- **Verification Evidence**:
  - `server/tests/trustfabricSolidity.test.ts` (9/9 passed).
  - `server/tests/decentralizedDonations.test.ts` (6/6 passed).
  - `smart ledger/frontend/src/tests/web3Donation.test.ts` (15/15 passed).

---

### 2. Smart Contract Layer (`TrustFabric.sol`)

- **Classification**: On-Chain Decentralized Protocol.
- **Current Implementation**:
  - Solidity contract deployed on Ethereum Sepolia testnet.
  - Manages campaigns, forwards ETH/ERC-20 donations atomically, registers Merkle batch roots, anchors salted payment commitments, and verifies Merkle proofs on-chain.
- **Who Controls It**:
  - Contract Owner (supports `transferOwnership` to a multi-sig or DAO governance address).
  - Authorized Relayer (restricted to calling `recordFiatDonation` and `recordBatchMerkleRoot`).
- **Can One Operator Censor It?**:
  - For direct donations (`donate`, `donateToken`): **No**. Any user can donate to any active campaign without relayer or owner approval.
  - For campaign status updates: Only owner can deactivate a campaign or change recipients.
- **Single Point of Failure (SPOF)**:
  - Ethereum Sepolia network liveness / EVM consensus.
- **Verification Evidence**:
  - On-chain Merkle proof verification test in `server/tests/merkleTree.test.ts`.
  - Reentrancy and token donation tests in `trustfabricSolidity.test.ts`.

---

### 3. Identity and Authentication Layer

- **Classification**: Hybrid (Decentralized SIWE + Federated Clerk / JWT fallback).
- **Current Implementation**:
  - **Primary**: Sign-In with Ethereum (EIP-4361 / SIWE) with 5-minute cryptographic challenge nonces, anti-replay consumption, domain binding, and explicit role mapping.
  - **Fallback**: Clerk federated authentication and standard test personas.
- **Who Controls It**:
  - SIWE: The user's self-custody private key (MetaMask / hardware wallet).
  - Role Assignment: Platform governance allowlist (explicitly mapped; key ownership does not confer admin rights).
  - Clerk: Centralized auth provider (Clerk, Inc.).
- **Can One Operator Censor It?**:
  - SIWE: **No**. Signatures are verified cryptographically using open-source math (`ethers.verifyMessage`).
  - Role Assignment: Governance operators control who receives `ADMIN` or `AUDITOR` permissions.
- **Single Point of Failure (SPOF)**:
  - None for SIWE key verification; backend issuance of JWT session relies on server master secret `JWT_SECRET`.
- **Verification Evidence**:
  - `server/tests/siweWalletAuth.test.ts` (7/7 passed).

---

### 4. Document & Evidence Storage Layer

- **Classification**: Decentralized Storage with Content Addressing and Client-Side/Envelope Encryption.
- **Current Implementation**:
  - Documents uploaded to IPFS with multihash addresses (CIDv0 / CIDv1).
  - **AES-256-GCM Envelope Encryption**: Sensitive documents are encrypted with ephemeral DEKs before IPFS distribution, preventing public gateway data leaks.
  - Pinata IPFS pinning with fallback to public IPFS gateways and local content-addressed vault `.evidence_vault/ipfs/`.
- **Who Controls It**:
  - Content Availability: Distributed IPFS swarm + Pinata pinning nodes + local replica.
  - Encryption Keys: TrustFabric Key Management Service / Master KEK.
- **Can One Operator Censor It?**:
  - Pinata can unpin a CID, but any node holding the content-addressed block can serve it. Local vault replica guarantees availability.
- **Single Point of Failure (SPOF)**:
  - If Pinata is offline and local vault is wiped, unpinned CIDs may become unavailable on public IPFS gateways.
- **Verification Evidence**:
  - `server/tests/ipfsStorage.test.ts` (14/14 passed).
  - `server/tests/evidenceEncryptionAndIndexing.test.ts` (5/5 passed).

---

### 5. Application State & Database Layer

- **Classification**: Disposable Cache & Reconstructable Index.
- **Current Implementation**:
  - Relational PostgreSQL / Supabase pooler for fast frontend queries.
  - **Chain Event Replay Indexer (`ChainIndexerService`)**: Application state (campaign summaries, donations, Merkle roots) can be completely reconstructed from raw blockchain logs.
  - **Fail-Fast Persistence**: Silent in-memory database fallback is strictly blocked when `NODE_ENV === 'production'`.
- **Who Controls It**:
  - PostgreSQL instance operator (Supabase / AWS RDS).
- **Can One Operator Censor It?**:
  - An operator can alter the relational DB, but **any client can detect the tampering** by comparing DB records against the blockchain event logs via `ChainIndexerService`.
- **Single Point of Failure (SPOF)**:
  - Database downtime impacts frontend read convenience, but does not disrupt smart contract execution or direct Web3 verification.
- **Verification Evidence**:
  - `server/tests/evidenceEncryptionAndIndexing.test.ts` (reconstruction tests).
  - `server/tests/dbPersistence.test.ts` (11/11 passed).

---

### 6. Relayer and Automated Background Jobs

- **Classification**: Verifiable Semi-Trusted Relayer.
- **Current Implementation**:
  - EOA signing account controlled by backend worker to submit Merkle batch roots and fiat commitments to `TrustFabric.sol`.
  - Queue managed by BullMQ / in-memory worker queue.
- **Who Controls It**:
  - TrustFabric infrastructure administrator possessing `RELAYER_PRIVATE_KEY`.
- **Can One Operator Censor It?**:
  - **Partially**. If the relayer refuses to anchor a batch, the off-chain batch remains unanchored on-chain. However, the relayer **cannot forge false donations** or intercept direct on-chain ETH donations.
- **Single Point of Failure (SPOF)**:
  - Relayer account running out of Sepolia gas or going offline.
- **Verification Evidence**:
  - `server/tests/liveRelayerPipeline.test.ts` (11/11 passed).

---

### 7. Stellar / Soroban Implementation

- **Classification**: Simulation / Educational Prototype.
- **Current Implementation**:
  - Frontend TypeScript mock/simulation of Stellar Soroban smart contract interactions (`smart ledger/frontend/src/services/stellarService.ts`).
  - No actual Rust Soroban contract is compiled or deployed to Stellar Futurenet or Mainnet.
- **Decentralization Reality**:
  - **0% Decentralized (Simulation Only)**.
  - Documented explicitly as a prototype to avoid false claims of multi-chain production readiness.

---

## Summary Scorecard

| Architectural Subsystem | Decentralization Status | Independent Verification Feasibility | Residual Trust Factor |
| :--- | :--- | :--- | :--- |
| **Direct Crypto Payments** | Fully Decentralized | 100% On-Chain via standard EVM tools | Ethereum consensus & miners |
| **Smart Contracts** | Fully Decentralized | 100% via Etherscan / bytecode verification | Contract Owner multisig |
| **Document Storage** | Decentralized & Encrypted | Cryptographic CID verification + AES auth tag | Pinata / IPFS availability & KEK safety |
| **Authentication** | Decentralized (SIWE) | Cryptographic signature verification | Identity-to-role governance registry |
| **Audit Indexing** | Reconstructable Index | 100% rebuildable from chain logs | RPC endpoint honesty |
| **Direct Bank Payments** | Auditable Fiat Rail | Bank UTR nullifier + on-chain hash | RBI / Indian Banking Clearinghouse |
| **Background Relayer** | Verifiable Privileged Worker | Contract-enforced parameter constraints | Relayer uptime and private key custody |
| **Stellar / Soroban** | Simulation Only | None (TypeScript simulation) | N/A (Not production decentralized) |
