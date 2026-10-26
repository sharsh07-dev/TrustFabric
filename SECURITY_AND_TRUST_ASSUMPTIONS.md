# TrustFabric: Security Model & Trust Assumptions

## 1. Threat Model & Security Invariants

TrustFabric operates under an adversarial threat model where:
1. Public networks and RPC providers may experience latency, dropped packets, or censorship attempts.
2. Attackers may attempt to spoof donor identities, replay past bank transfers, or inject malicious smart contracts.
3. Centralized intermediaries (gateways, databases, cloud nodes) are vulnerable to downtime, insider compromise, or operator errors.
4. Public decentralized storage nodes (IPFS gateways) inspect all uploaded content; unencrypted privacy data is considered immediately leaked.

---

## 2. Smart Contract Security (`TrustFabric.sol`)

### 2.1 Reentrancy & Fallback Hijacking
- **Vulnerability**: In naive contracts, calling `recipient.call{value: msg.value}("")` allows a malicious contract recipient to invoke fallback execution and re-enter the calling contract.
- **Protection**: `TrustFabric.sol` inherits OpenZeppelin's battle-tested `ReentrancyGuard` and applies `nonReentrant` to all external payment entrypoints (`donate`, `donateToken`).

### 2.2 Access Control & Ownership Transfer
- **Remediation of SEC-01**: Previously, `TrustFabric.sol` set `owner = msg.sender` with no mechanism to rotate ownership or transfer control to a multi-sig or DAO governance contract.
- **Implementation**: Implemented `transferOwnership(address newOwner)` with `onlyOwner` enforcement, zero-address rejection (`newOwner != address(0)`), and emission of `OwnershipTransferred(previousOwner, newOwner)`.

### 2.3 SafeERC20 Low-Level Call Semantics
- **Vulnerability**: Nonstandard tokens (e.g. USDT) revert when called with naive high-level Solidity syntax (`IERC20(token).transferFrom(...)`) because they return no data instead of a boolean.
- **Protection**: Internal `_safeTransferFrom` executes low-level `token.call(0x23b872dd, ...)` and verifies both the call success flag and return buffer size.

---

## 3. Relayer Trust Boundary & Privileged Execution

The background relayer is a semi-trusted execution worker. Its trust assumptions and limits are strictly enforced:

### 3.1 What the Relayer CANNOT Do
- **Cannot Steal Direct ETH Donations**: Direct donations are executed peer-to-contract-to-recipient; the relayer has no role or custody.
- **Cannot Forge Fake Campaigns**: Only the contract owner can register campaigns or alter recipient addresses.
- **Cannot Divert Funds**: The relayer only submits Merkle batch roots and salted fiat commitments. It cannot initiate fund withdrawals.

### 3.2 What the Relayer CAN Do (Privileged Scope)
- Anchor Merkle batch roots via `recordBatchMerkleRoot`.
- Anchor salted fiat commitments via `recordFiatDonation`.

### 3.3 Relayer Failure & Offline Behavior
- **If the Relayer Runs Out of Gas**: Transactions remain queued in BullMQ / in-memory queues with exponential backoff and alerting.
- **If the Relayer Goes Offline**: Direct crypto donations are unaffected and continue settling on-chain. Off-chain batch root anchoring is delayed until the relayer is restored.
- **Private Key Custody**: `RELAYER_PRIVATE_KEY` must be stored in Hardware Security Modules (AWS KMS, HashiCorp Vault) in production; it is never committed to source control or exposed to frontends.

---

## 4. Evidence Privacy: AES-256-GCM Envelope Encryption

### 4.1 The Public IPFS Privacy Hazard
IPFS is a public, globally addressable distributed hash table (DHT). **Any file uploaded to IPFS can be read by any node holding the CID.** Storing unencrypted Indian PAN cards, NGO 80G/12A tax certificates, cancelled cheques, or field invoices exposes donors, NGOs, and vendors to statutory privacy violations under the Digital Personal Data Protection Act (DPDP).

### 4.2 Implemented Envelope Encryption Architecture
- **Cipher**: AES-256-GCM (Galois/Counter Mode) with 128-bit authentication tag for authenticated encryption.
- **Key Hierarchy**:
  - Ephemeral Data Encryption Key (DEK): 32 random bytes generated per document.
  - Master Key Encryption Key (KEK): 256-bit key used to wrap the DEK.
- **Verification Guarantee**: Tampered ciphertexts trigger an immediate authentication tag verification exception before any bytes are returned to callers.

---

## 5. Identity vs. Real-World Authorization Boundary

A fundamental tenet of zero-trust Web3 systems is:
> **A cryptographic wallet signature proves control of a private key, NOT real-world identity, NGO legitimacy, or fiduciary integrity.**

- **Sign-In with Ethereum (SIWE)**:
  - Any user can generate a key pair and sign an EIP-4361 challenge.
  - Therefore, the system assigns a default role of `DONOR` to newly authenticated wallets.
- **Privileged Roles (`ADMIN`, `AUDITOR`)**:
  - Elevated roles are not granted simply because an address signs in.
  - Elevated roles require verified off-chain registration and explicit entry into the platform's governance allowlist.
  - This prevents malicious actors from generating a new wallet and attempting to authorize expense claims or review applications.

---

## 6. Banking Clearinghouse & Regulatory Realities

- Direct Bank Transfers (INR / UPI) settle through the RBI/NPCI clearinghouse system.
- While cryptographic commitments and UTR nullifiers prevent double-claiming on TrustFabric, the legal and monetary transfer remains subject to commercial banking laws and KYC/AML regulations.
- The platform documents this transparently: bank transfers are treated as **auditable zero-fee fiat contributions**, not pseudo-crypto.
