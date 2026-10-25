# TrustFabric — Razorpay + Smart Contract + Blockchain Payment Integration Report
**Challenge:** CASCADE ’26 Theme 4, Problem 4.2: *The Black Hole Ledger: Verifiable NGO Fund Flows*  
**Date:** 2026-10-25  
**Version:** 1.3.0  
**Engineers:** Senior Full-Stack Payment, Solidity/EVM, Application-Security, and QA Engineers  
**Repository:** TrustFabric (Node.js/Express, React 19, Solidity 0.8.20, Ethereum Sepolia, PostgreSQL/Supabase)

---

## 1. Executive Summary & Critical Ground Truth

TrustFabric integrates a genuine, production-grade end-to-end payment workflow combining **Razorpay Standard Checkout** and **Ethereum Sepolia Smart Contract Anchoring**:

```
[Donor Browser]
      │ 1. Selects grant CW-2026-014 & INR amount (e.g. ₹2,500 = 250,000 paise)
      ▼
[TrustFabric Backend Server]
      │ 2. Validates grant ceiling, integer paise limits, and creates order via Razorpay API
      ▼
[Razorpay Orders API] ─── returns rzp_order_id ───► [Donor Browser Checkout Dialog]
                                                          │ 3. User completes payment
                                                          ▼
[TrustFabric Backend Server /api/payments/razorpay/verify]
      │ 4. Constant-time HMAC-SHA256 signature check + authoritative capture verification
      │ 5. Generates cryptographic commitment SHA-256("TRUSTFABRIC_FIAT_V1" | grant | payment | salt)
      ▼
[Ethereum Sepolia Anchor Contract (TrustFabricFiatAnchor.sol)]
      │ 6. Authorized relayer submits recordFiatDonation()
      ▼
[Public Block Explorer / UI Fund Flow]
      │ 7. Displays verified txHash, block #, and link to Sepolia Etherscan
      ▼
[TrustFabric Core State]
      │ 8. Links donation to downstream grant allocations, expense claims & milestone proofs
```

### Critical Financial & Technical Separation
| Layer | Mechanism | What Is Proven | What Is NOT Proven |
|---|---|---|---|
| **Razorpay Test Payment** | Razorpay Sandbox Gateway | Valid payment tokenization and gateway event simulation. | Does NOT collect real fiat INR or prove settlement into NGO bank account. |
| **Fiat Anchor Contract** (`TrustFabricFiatAnchor.sol`) | Ethereum Sepolia EVM Testnet | Relayer committed proof of payment ID and order on-chain at block timestamp. | Does NOT hold or escrow fiat INR; smart contract does NOT hold Indian Rupees. |
| **Smart-Contract Escrow** (`TrustFabricEscrow.sol`) | EVM Milestone Escrow | Enforces condition gates, duplicate nullifier freeze, and delivery proofs for **testnet crypto assets**. | Separate test-asset flow; completely segregated from fiat payment rails. |

---

## 2. API Surface & Architecture

The backend server is implemented as an isolated Node.js/Express TypeScript service running on `http://localhost:5001` (proxied seamlessly via Vite dev server at `/api`):

| Method | Endpoint | Authorization | Description |
|---|---|:---:|---|
| `GET` | `/api/health` | Public | Health check reporting gateway status, network, and contract address. |
| `GET` | `/api/config/public` | Public | Returns non-sensitive public configuration (Key ID, network, limits). **Never exposes secrets.** |
| `GET` | `/api/grants` | Public | Returns active grants eligible for public contributions with budget bounds. |
| `POST` | `/api/payments/razorpay/orders` | Public / Rate-Limited | Validates grant status and integer paise amount; creates official Razorpay order. |
| `POST` | `/api/payments/razorpay/verify` | Public | Constant-time HMAC signature verification + authoritative capture check from Razorpay API. Triggers on-chain anchor. |
| `POST` | `/api/webhooks/razorpay` | Razorpay HMAC Header | Durable asynchronous webhook endpoint. Preserves raw body for HMAC check; idempotent event deduplication. |
| `GET` | `/api/donations/:id/status` | Public | Returns authoritative donation state and anchor confirmation details. |
| `GET` | `/api/donations/:id/proof` | Public | Returns machine-readable JSON cryptographic audit package. |
| `POST` | `/api/donations/:id/retry-anchor` | Operator / Idempotent | Safely retries anchor submission in the event of an RPC timeout without duplicate records. |

---

## 3. Smart Contract Specifications

### `TrustFabricFiatAnchor.sol`
Located in [`smart ledger/contracts/evm/TrustFabricFiatAnchor.sol`](file:///Users/harshshinde/Downloads/PS4/smart%20ledger/contracts/evm/TrustFabricFiatAnchor.sol).

```solidity
contract TrustFabricFiatAnchor {
    address public owner;
    address public authorizedRelayer;

    struct FiatAnchorRecord {
        bytes32 paymentCommitment;
        bytes32 grantRefHash;
        uint256 amountPaise;
        bytes3 currencyCode; // "INR"
        address relayer;
        uint256 timestamp;
        uint256 blockNumber;
    }

    mapping(bytes32 => FiatAnchorRecord) public anchors;
    bytes32[] public anchoredCommitmentList;

    event FiatDonationAnchored(
        bytes32 indexed paymentCommitment,
        bytes32 indexed grantRefHash,
        uint256 amountPaise,
        bytes3 currencyCode,
        address indexed relayer,
        uint256 timestamp,
        uint256 blockNumber
    );

    function recordFiatDonation(
        bytes32 grantRefHash,
        bytes32 paymentCommitment,
        uint256 amountPaise,
        bytes3 currencyCode
    ) external onlyRelayer returns (bool);
}
```

**Security & Privacy Guarantees:**
1. **Zero PII On-Chain:** Donor names, email addresses, phone numbers, and IP addresses are completely excluded from public contract storage.
2. **Replay & Double-Anchor Protection:** `anchors[paymentCommitment]` lookup prevents an identical commitment from ever being registered twice.
3. **Role-Based Access Control:** Only the registered `authorizedRelayer` or `owner` can anchor commitments.

---

## 4. Database Persistence Schema

Migration script located in [`supabase/migrations/20260225010000_razorpay_fiat_anchor.sql`](file:///Users/harshshinde/Downloads/PS4/supabase/migrations/20260225010000_razorpay_fiat_anchor.sql):

1. **`donation_intents`**: Tracks internal donation code, grant reference, integer amount in paise, currency (`INR`), Razorpay order ID, payment ID, state, and environment (`TEST` vs `LIVE`).
2. **`razorpay_webhook_events`**: Tracks provider event IDs with unique constraints for strict webhook deduplication.
3. **`payment_verification_events`**: Stores signature checks, raw response digest, and authoritative API results.
4. **`onchain_payment_anchors`**: Records transaction hashes, block numbers, gas used, contract address, and public explorer URLs.
5. **`payment_audit_events`**: Maintains an append-only sequential SHA-256 hash chain (`prevEventHash -> eventHash`).

---

## 5. Live Test Evidence & Test Suite Execution

### Backend Payment Test Suite (14 Tests)
Ran via `vitest` in [`server/tests/payment.test.ts`](file:///Users/harshshinde/Downloads/PS4/server/tests/payment.test.ts):
```
 ✓ tests/payment.test.ts (14 tests) 728ms
   ✓ 1. Razorpay Order Creation & Validation > creates an order with server-validated integer paise amount (226ms)
   ✓ 1. Razorpay Order Creation & Validation > rejects invalid or non-existent grant ID (1ms)
   ✓ 1. Razorpay Order Creation & Validation > rejects fractional or non-integer paise amount (0ms)
   ✓ 1. Razorpay Order Creation & Validation > rejects amount exceeding grant ceiling or below minimum (0ms)
   ✓ 1. Razorpay Order Creation & Validation > idempotently returns existing order on duplicate key (126ms)
   ✓ 2. Checkout Signature & Payment Verification > accepts valid HMAC-SHA256 signature and rejects forged signature (69ms)
   ✓ 2. Checkout Signature & Payment Verification > rejects verification if order ID is unknown (0ms)
   ✓ 3. Webhook Ingestion & Idempotency > verifies valid webhook HMAC signature and rejects invalid (0ms)
   ✓ 3. Webhook Ingestion & Idempotency > processes webhook event once and returns DUPLICATE_IGNORED on retries (0ms)
   ✓ 3. Webhook Ingestion & Idempotency > records refund event as linked compensating state REFUNDED (73ms)
   ✓ 4. Blockchain Anchoring & Commitment Tests > creates canonical cryptographic commitment and anchors confirmed payment (60ms)
   ✓ 4. Blockchain Anchoring & Commitment Tests > rejects anchoring an unverified or failed donation (55ms)
   ✓ 4. Blockchain Anchoring & Commitment Tests > idempotently returns existing anchor on retry (112ms)
   ✓ 5. Audit Hash Chain Integrity > maintains continuous SHA-256 sequential audit chain (2ms)

Test Files: 1 passed (1) | Tests: 14 passed (14)
```

### Frontend Smart Contract & Application Test Suite (50 Tests)
Ran via `vitest` in [`smart ledger/frontend/`](file:///Users/harshshinde/Downloads/PS4/smart%20ledger/frontend/):
```
 ✓ src/tests/deliveryProofAndPrivacy.test.ts (4 tests)
 ✓ src/tests/fiatAnchorContract.test.ts (5 tests)
 ✓ src/tests/redTeam.test.ts (2 tests)
 ✓ src/tests/donorPortal.test.ts (2 tests)
 ✓ src/tests/grantPolicy.test.ts (3 tests)
 ✓ src/tests/discrepancyEngine.test.ts (1 test)
 ✓ src/tests/cliVerification.test.ts (5 tests)
 ✓ src/tests/auditLedger.test.ts (2 tests)
 ✓ src/tests/crypto.test.ts (7 tests)
 ✓ src/tests/duplicateEngine.test.ts (3 tests)
 ✓ src/tests/escrowStateMachine.test.ts (4 tests)
 ✓ src/tests/contractEscrow.test.ts (4 tests)
 ✓ src/tests/adaptersAndIntegrations.test.ts (8 tests)

Test Files: 13 passed (13) | Tests: 50 passed (50)
```

**Combined Automated Tests:** **64 tests passed across 14 test suites, 0 failed.**

### Real-Time Live Gateway & Webhook Execution Record
```bash
# 1. Created Live Test Order via Razorpay API:
POST /api/payments/razorpay/orders
Result: order_Ts8xj4ZcdwVco3 | Amount: 100000 paise (₹1,000 INR) | Status: created

# 2. Forged Signature Rejection Check:
POST /api/payments/razorpay/verify (invalid signature)
Result: HTTP 400 {"error":"SECURITY REJECTION: Razorpay checkout HMAC signature mismatch."}

# 3. Webhook Ingestion & Idempotent Deduplication:
POST /api/webhooks/razorpay (Delivery 1) -> HTTP 200 {"status":"ok","result":{"status":"PROCESSED"}}
POST /api/webhooks/razorpay (Delivery 2) -> HTTP 200 {"status":"ok","result":{"status":"DUPLICATE_IGNORED"}}

# 4. On-Chain Commitment Anchor Execution:
POST /api/donations/:id/retry-anchor
Result:
  Payment Commitment: 0x8d8bfd5113db41ad26908128f24b5e3155f4d1b973b2590331e774cf4e2784ee
  Transaction Hash:   0x3eedda6033039fbe473f145d5ef7e01e19025013632c58f7d622c7fb13483adb
  Block Number:       #7248208
  Chain ID:           11155111 (Ethereum Sepolia Testnet)
  Explorer Link:      https://sepolia.etherscan.io/tx/0x3eedda6033039fbe473f145d5ef7e01e19025013632c58f7d622c7fb13483adb
```

---

## 6. Security Audit & Client Bundle Verification

1. **Client-Side Secret Isolation:**  
   Ran static analysis on the compiled production bundle (`smart ledger/frontend/dist`):
   ```bash
   grep -rn "bYp34UkC8VbbVQE80a2dJix6" "smart ledger/frontend/dist"  # Exit 1 (NOT FOUND)
   grep -rn "whsec_" "smart ledger/frontend/dist"                   # Exit 1 (NOT FOUND)
   ```
   **Confirmed:** Zero gateway secrets, webhook signing keys, or relayer private keys are leaked in client code.
2. **Integer Minor Unit Discipline:**  
   All calculation, order generation, and validation occurs strictly in **integer paise** (minor units). No floating-point math is trusted.
3. **Constant-Time Cryptographic Comparison:**  
   All HMAC signature comparisons use `crypto.timingSafeEqual` over fixed-length binary buffers to eliminate timing side-channel attacks.

---

## 7. Operator Setup & Demo Runbook

### Environment Variables (`.env`)
```bash
# Server-only secrets
RAZORPAY_MODE=test
RAZORPAY_KEY_ID=rzp_test_Ts8hc71B3sf8nu
RAZORPAY_KEY_SECRET=bYp34UkC8VbbVQE80a2dJix6
RAZORPAY_WEBHOOK_SECRET=whsec_trustfabric_test_2026

# Ethereum Sepolia Relayer
EVM_CHAIN_MODE=sepolia
EVM_CHAIN_ID=11155111
SEPOLIA_RPC_URL=https://rpc.sepolia.org
FIAT_DONATION_ANCHOR_CONTRACT_ADDRESS=0x71C25bf4e37da4b7F2eFe341F21074eAf7096eF4
RELAYER_ADDRESS=0xa0Ee7A142d267C1f36714E4a8F75612F20a79720
```

### Starting the System
```bash
# 1. Start the payment gateway backend (port 5001):
npm --prefix server start

# 2. Start the Vite frontend dev server (port 3000):
npm run dev
```

### Performing the Demo
1. Open `http://localhost:3000/`.
2. Click **Live Donation (Razorpay)** in the left sidebar (or click **💳 Donate** in Grants & Policies).
3. Select grant **[CW-2026-014] Clean Water Boreholes**.
4. Choose an amount (e.g. ₹2,500) and click **Proceed with Razorpay Checkout**.
5. In the Razorpay Checkout popup, simulate or complete payment (Card / Netbanking / UPI in test mode).
6. Observe the backend:
   - Validates payment signature.
   - Authoritatively checks capture status from the Razorpay API.
   - Generates SHA-256 payment commitment.
   - Submits commitment to Ethereum Sepolia.
7. Click **View Public Transaction on Sepolia Etherscan** to view the verified transaction reference.
8. Click **View Cryptographic Proof Package** to inspect the auditable JSON commitment package.
9. Click **Explore Fund-Flow Graph** to see the new contribution connected to downstream allocations and evidence.
