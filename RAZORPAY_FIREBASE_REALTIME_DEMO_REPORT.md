# TrustFabric — Razorpay Test Payments + Firebase Realtime Database + Sepolia
**Master Implementation & Judge Demonstration Report**  
**Challenge:** CASCADE ’26 Theme 4, Problem 4.2: *The Black Hole Ledger: Verifiable NGO Fund Flows*  
**Date:** 2026-10-25  
**Version:** 1.4.0  
**Engineers:** Senior Full-Stack Payments, Firebase Security, Solidity/EVM, and QA Leads  
**Repository:** TrustFabric (Node.js/Express, React 19, Firebase Realtime Database, Solidity 0.8.20, Ethereum Sepolia)

---

## 1. Executive Summary & Non-Negotiable Ground Truth

This release implements a production-grade live demonstration architecture uniting three distinct trust domains:

```
[Donor (Aarav)]
      │ 1. Submits ₹500 (50,000 paise) via Razorpay Standard Checkout
      ▼
[TrustFabric Backend Server (Port 5001)]
      │ 2. Validates integer paise limits & creates official Razorpay order
      │ 3. Writes private payment intent to Firebase Realtime Database
      ▼
[Razorpay Orders API] ─── returns rzp_order_id ───► [Razorpay Checkout Modal]
                                                          │ 4. Test payment completed
                                                          ▼
[TrustFabric Backend Server /api/payments/razorpay/verify]
      │ 5. Validates HMAC-SHA256 signature in constant time
      │ 6. Queries authoritative capture status from Razorpay API
      │ 7. Updates Firebase RTDB /private/payments & /public/donations
      ▼
[Firebase Realtime Database (ngoledger-default-rtdb)]
      │ 8. Realtime WebSocket listener pushes update to NGO Admin (Meera) & Auditor screens
      ▼
[Ethereum Sepolia Contract (TrustFabricFiatAnchor.sol)]
      │ 9. Authorized relayer anchors SHA-256("TRUSTFABRIC_FIAT_V1" | ...) commitment
      ▼
[TrustFabric Core State]
      │ 10. Links donation into Fund-Flow graph & displays verified Sepolia Etherscan link
```

### Three Distinct Trust Domains (Truth in Labeling)
| Trust Domain | Execution Layer | What Is Proven | What Is NOT Proven |
|---|---|---|---|
| **Razorpay Test Mode** | Sandbox Payment Gateway | Genuine tokenization, checkout callbacks, and test order/payment IDs. | **Does NOT collect real fiat money** or prove settlement into NGO bank account. |
| **Firebase Realtime DB** | Google Firebase RTDB (`ngoledger-default-rtdb`) | Remote persistence, multi-role synchronization, and sub-second live feeds. | Does not replace backend cryptographic signatures or on-chain consensus. |
| **Ethereum Sepolia** | EVM Testnet (`TrustFabricFiatAnchor.sol`) | Immutable timestamped commitment of payment reference anchored by authorized relayer. | **Does NOT hold Indian Rupees in escrow.** Smart contracts cannot hold off-chain fiat. |
| **Milestone Escrow** | EVM Escrow (`TrustFabricEscrow.sol`) | Condition gates and duplicate expense nullifier freezing for **testnet crypto assets**. | Separate asset rail; completely independent of Razorpay fiat payments. |
| **Seeded NGO Evidence** | Historical Test Corpus | Demonstrates invoice verification, duplicate detection, and OCR inspection. | **Seeded sample bills were NOT paid by the new ₹500 test payment.** |

---

## 2. Inventory of Files Changed & Created

1. **`server/src/services/firebaseService.ts`**: Server-side Firebase service syncing intents, captures, blockchain anchors, and campaign totals to `https://ngoledger-default-rtdb.firebaseio.com`.
2. **`smart ledger/frontend/src/services/firebaseClient.ts`**: Client-side Firebase Realtime Database integration with connection status monitoring (`.info/connected`) and live listeners (`onValue`).
3. **`database.rules.json`**: Security rules enforcing public read on sanitized projections (`/public/campaigns`, `/public/donations`, `/public/fundFlowEvents`) and denying unauthorized client writes everywhere.
4. **`smart ledger/frontend/src/components/DonationView.tsx`**: Multi-role live demonstration dashboard (Aarav, Meera, Ravi, Judge) with live RTDB indicators, segmented totals, and accounting allocation controls.
5. **`smart ledger/frontend/src/App.tsx` & `Layout.tsx`**: Primary navigation and state wiring.
6. **`smart ledger/contracts/evm/TrustFabricFiatAnchor.sol`**: Solidity contract for on-chain cryptographic donation commitments.
7. **`supabase/migrations/20260225010000_razorpay_fiat_anchor.sql`**: Production PostgreSQL migration with 5 tables, unique constraints, and RLS policies.
8. **`server/tests/payment.test.ts`**: Automated Vitest test suite (14 tests) covering orders, signatures, webhooks, idempotency, and anchors.
9. **`smart ledger/frontend/src/tests/fiatAnchorContract.test.ts`**: Smart contract unit tests verifying relayer authorization, duplicate rejection, and events.

---

## 3. Firebase Realtime Database Data Architecture

### Path Hierarchy
```
/public
  ├── /campaigns/{campaignId}       -> Title, purpose, target, segmented totals
  ├── /donations/{donationId}       -> Sanitized donation record (zero PII)
  └── /fundFlowEvents/{eventId}     -> Public fund timeline events with provenance tags

/private
  ├── /paymentIntents/{donationId}  -> Internal order binding, expected amount, donor details
  ├── /payments/{donationId}        -> Authoritative Razorpay gateway verification details
  ├── /webhookEvents/{eventId}      -> Ingested provider event records for deduplication
  ├── /blockchainAnchors/{donationId} -> Sepolia txHash, block number, commitment hash
  └── /auditEvents/{eventId}        -> Cryptographic sequential SHA-256 audit blocks
```

### Security Rules Summary (`database.rules.json`)
- **Default Deny:** `.read: false, .write: false` at root.
- **Client Write Lockdown:** All client SDK writes are rejected (`.write: false`). Only the trusted backend service can write authoritative payment states, campaign totals, and anchor receipts.
- **Zero PII in Public Paths:** `/public/donations` rejects any write containing `donorEmail`, `donorPhone`, or payment secrets.

---

## 4. Live Verification Evidence & Test Results

### A. Automated Test Suites (64 Tests Passing)
```bash
# Backend Test Suite (server/tests/payment.test.ts)
✓ 1. Razorpay Order Creation & Validation > creates an order with server-validated integer paise amount (390ms)
✓ 1. Razorpay Order Creation & Validation > rejects invalid or non-existent grant ID (1ms)
✓ 1. Razorpay Order Creation & Validation > rejects fractional or non-integer paise amount (0ms)
✓ 1. Razorpay Order Creation & Validation > rejects amount exceeding grant ceiling or below minimum (0ms)
✓ 1. Razorpay Order Creation & Validation > idempotently returns existing order on duplicate key (92ms)
✓ 2. Checkout Signature & Payment Verification > accepts valid HMAC-SHA256 signature and rejects forged signature (153ms)
✓ 2. Checkout Signature & Payment Verification > rejects verification if order ID is unknown (0ms)
✓ 3. Webhook Ingestion & Idempotency > verifies valid webhook HMAC signature and rejects invalid (0ms)
✓ 3. Webhook Ingestion & Idempotency > processes webhook event once and returns DUPLICATE_IGNORED on retries (1ms)
✓ 3. Webhook Ingestion & Idempotency > records refund event as linked compensating state REFUNDED (65ms)
✓ 4. Blockchain Anchoring & Commitment Tests > creates canonical cryptographic commitment and anchors confirmed payment (70ms)
✓ 4. Blockchain Anchoring & Commitment Tests > rejects anchoring an unverified or failed donation (64ms)
✓ 4. Blockchain Anchoring & Commitment Tests > idempotently returns existing anchor on retry (98ms)
✓ 5. Audit Hash Chain Integrity > maintains continuous SHA-256 sequential audit chain (2ms)

Test Files: 1 passed (1) | Tests: 14 passed (14)

# Frontend Core & Contract Test Suites (smart ledger/frontend/)
Test Files: 13 passed (13) | Tests: 50 passed (50)
```
**Total:** **64 automated tests passed, 0 failed.**

### B. Live Sandbox & On-Chain Execution Record
```bash
# 1. Created Live Razorpay Sandbox Order
POST /api/payments/razorpay/orders
Result: order_Ts8xj4ZcdwVco3 | Amount: 100000 paise (₹1,000 INR) | Status: created

# 2. Forged Signature Rejection
POST /api/payments/razorpay/verify (bad signature)
Result: HTTP 400 {"error":"SECURITY REJECTION: Razorpay checkout HMAC signature mismatch."}

# 3. Webhook Ingestion & Idempotency
POST /api/webhooks/razorpay (Delivery 1) -> HTTP 200 {"status":"ok","result":{"status":"PROCESSED"}}
POST /api/webhooks/razorpay (Delivery 2) -> HTTP 200 {"status":"ok","result":{"status":"DUPLICATE_IGNORED"}}

# 4. Ethereum Sepolia Anchor Commitment
Payment Commitment: 0x8d8bfd5113db41ad26908128f24b5e3155f4d1b973b2590331e774cf4e2784ee
Transaction Hash:   0x3eedda6033039fbe473f145d5ef7e01e19025013632c58f7d622c7fb13483adb
Block Number:       #7248208
Contract Address:   0x71C25bf4e37da4b7F2eFe341F21074eAf7096eF4
Chain ID:           11155111 (Ethereum Sepolia Testnet)
Explorer Link:      https://sepolia.etherscan.io/tx/0x3eedda6033039fbe473f145d5ef7e01e19025013632c58f7d622c7fb13483adb
```

### C. Client Production Bundle Security Scan
```bash
grep -rn "bYp34UkC8VbbVQE80a2dJix6" "smart ledger/frontend/dist"  # Exit 1 (No secrets leaked)
grep -rn "whsec_" "smart ledger/frontend/dist"                   # Exit 1 (No secrets leaked)
```
Zero API key secrets, webhook keys, or relayer private keys are present in compiled client code.

---

## 5. Four-Role Demo Walkthrough Script (2–3 Minutes)

### Step 1: Donor View &mdash; Aarav (Payment Ingress)
1. Navigate to **`http://localhost:3000/`** and click **Live Donation (Razorpay)**.
2. Ensure the top role is **1. Donor &mdash; Aarav**.
3. Point out the banner: `RAZORPAY TEST MODE (NO REAL MONEY MOVES)`.
4. The campaign **[CW-2026-014] Clean Water Boreholes** is pre-selected for ₹500 (50,000 paise).
5. Click **Proceed with Razorpay Checkout (₹500)**.
6. In the Razorpay popup, simulate payment (Card / Netbanking / UPI).
7. Observe the server verify HMAC signature and authoritative capture status, then anchor the commitment on Sepolia.

### Step 2: NGO Admin View &mdash; Meera (Live RTDB Inbound Feed)
1. Switch to **2. NGO Admin &mdash; Meera** (or open in a second browser window).
2. Point out that the newly captured donation appears in the inbound feed **in real time via Firebase RTDB without manual refresh**.
3. Show the **Segmented Provenance Totals**:
   - `SEEDED_DEMO_DATA`: ₹10,00,000 (historical grant ceiling)
   - `RAZORPAY_TEST_CAPTURED`: ₹500 (test mode funds)
   - `LIVE_NOT_CONFIGURED`: ₹0 (truthful zero)
4. Click **+ Create Internal Accounting Allocation** and allocate ₹500 to *Solar Borehole Filter Cartridges*. Point out the disclosure: *This is an internal accounting assignment, not a real external bank payout*.

### Step 3: Field Worker / Vendor View &mdash; Ravi (Evidence Workspace)
1. Switch to **3. Field Worker / Vendor &mdash; Ravi**.
2. Inspect the seeded sample invoice (`APEX-2026-0881`) and Ed25519 inspector attestation.
3. Show that seeded bills are explicitly labeled `SEEDED_DEMO_DATA` and not falsely attributed as paid by Aarav's ₹500 payment.

### Step 4: Auditor / Judge View (Independent Verification)
1. Switch to **4. Auditor / Judge &mdash; Read-Only**.
2. Point out that **zero donor email, phone, or payment credentials** are exposed.
3. Inspect the verified cryptographic commitment hash and click **Inspect Sepolia Etherscan &rarr;** to view the actual Ethereum transaction.
4. Click **Audit Proof Package** to review the machine-readable JSON verification export.

---

## 6. Environment Setup & Configuration

### `.env` (Server Secrets & Configuration)
```bash
# Razorpay Sandbox Credentials
RAZORPAY_MODE=test
RAZORPAY_KEY_ID=rzp_test_Ts8hc71B3sf8nu
RAZORPAY_KEY_SECRET=bYp34UkC8VbbVQE80a2dJix6
RAZORPAY_WEBHOOK_SECRET=whsec_trustfabric_test_2026

# Firebase Realtime Database
FIREBASE_DATABASE_URL=https://ngoledger-default-rtdb.firebaseio.com
FIREBASE_PROJECT_ID=ngoledger

# Ethereum Sepolia Testnet
EVM_CHAIN_MODE=sepolia
EVM_CHAIN_ID=11155111
SEPOLIA_RPC_URL=https://rpc.sepolia.org
FIAT_DONATION_ANCHOR_CONTRACT_ADDRESS=0x71C25bf4e37da4b7F2eFe341F21074eAf7096eF4
RELAYER_ADDRESS=0xa0Ee7A142d267C1f36714E4a8F75612F20a79720
```

### Running the Services
```bash
# 1. Start Payment & RTDB Gateway Server (Port 5001):
npm --prefix server start

# 2. Start Vite Frontend Dashboard (Port 3000):
npm run dev

# 3. Run all tests:
npm test
```
