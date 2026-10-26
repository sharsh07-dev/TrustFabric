# TrustFabric: Razorpay Dependency Audit & Removal Plan

## Executive Summary

This audit establishes a complete, evidence-based file-by-file inventory of every Razorpay dependency across the TrustFabric repository. While previous stages decoupled the backend server startup and added direct Web3 donation endpoints, **Razorpay remained visible in frontend marketing, UI options, and client checkout paths**.

This document categorizes every match, traces the exact execution paths, and details the concrete removal of Razorpay from the live cryptocurrency donation workflow.

---

## 1. Classification Methodology

Every repository occurrence of `razorpay` is classified into one of seven categories:
1. **Active Payment Dependency**: Code that actively requires Razorpay API credentials or SDK execution to process a payment.
2. **Active Backend Integration**: Backend routes, services, or controllers that handle Razorpay order creation, status verification, or webhooks.
3. **Active Frontend Integration**: UI components, forms, buttons, or scripts that expose Razorpay checkout to the user.
4. **Unused / Dead Code**: Relic methods, commented-out logic, or unreferenced helper functions.
5. **Test Fixture**: Mock payloads, test cases, or signatures used solely to verify legacy handling.
6. **Documentation**: Reports, diagrams, or architectural analysis discussing Razorpay.
7. **Historical Record / Schema Compatibility**: Database columns, audit logs, or nullifier mappings that preserve historical payment records.

---

## 2. File-by-File Dependency Inventory

| File Path | Match Summary | Classification | Current Behavior & Defect |
| :--- | :--- | :--- | :--- |
| `smart ledger/frontend/src/components/LandingPage.tsx` | Lines 113, 142, 171, 187, 290, 301, 387, 437, 490, 507, 541 | **Active Frontend Integration** | **DEFECT**: Landing page displays "Open Live Razorpay Test Mode Donation View", "15-Second Razorpay Sandbox Checkout", and "Process donations via Razorpay Standard Test Mode". Must be purged. |
| `smart ledger/frontend/src/components/DonationView.tsx` | Lines 52, 212–352, 600–1200 | **Active Frontend Integration** | **DEFECT**: Renders `RAZORPAY_INR` tab, form inputs, `handleStartCheckout`, and checkout modal logic. Must be removed from active donation workflow. |
| `smart ledger/frontend/src/services/paymentService.ts` | Lines 120–250 | **Active Frontend Integration** | Contains `createOrder`, `verifyPayment`, and `loadRazorpayScript`. Must be decoupled from the primary donation path. |
| `smart ledger/frontend/src/services/firebaseClient.ts` | Lines 54, 73, 92, 136 | **Historical / Schema** | Synced donation record schema fields (`razorpayOrderId`, `razorpayPaymentId`). |
| `smart ledger/frontend/src/services/realtimeClient.ts` | Lines 30, 65 | **Historical / Schema** | Optional realtime payload field `razorpayPaymentId` for historical event display. |
| `server/src/routes/paymentRoutes.ts` | Lines 186–370 | **Active Backend Integration** | `POST /api/payments/razorpay/orders`, `POST /api/payments/razorpay/verify`, `POST /api/payments/razorpay/webhook`. Kept for backward compatibility/historical tests. |
| `server/src/services/razorpayService.ts` | Entire File (430 lines) | **Active Backend Integration** | Service calling Razorpay REST API (`https://api.razorpay.com/v1/orders`). Isolated; never invoked by crypto donations. |
| `server/src/config.ts` | Lines 9–14 | **Active Backend Integration** | Optional `razorpayKeyId`, `razorpayKeySecret`. Server runs without them (`isRazorpayConfigured: false`). |
| `server/src/index.ts` | Lines 26, 49, 88 | **Active Backend Integration** | Allowed header `x-razorpay-signature` and startup logs. |
| `server/src/db.ts` | Lines 25, 45 | **Historical Record** | `orderIdIndex` map and `getDonationByOrderId`. Preserves past transaction lookups. |
| `server/src/types.ts` | Lines 25, 40–52 | **Historical / Schema** | `DonationIntent.razorpayOrderId` and `RazorpayWebhookEvent` interface. |
| `server/prisma/schema.prisma` | Lines 153–165 | **Historical / Schema** | PostgreSQL columns `razorpayOrderId` and `razorpayPaymentId`. Must be preserved to prevent schema corruption. |
| `server/tests/payment.test.ts` | Entire File (14 tests) | **Test Fixture** | Automated tests for HMAC signature verification and order creation. |
| `server/tests/decentralizedDonations.test.ts` | Tests 5–6 | **Test Fixture** | Explicitly asserts that historical Razorpay records are preserved and not relabeled. |
| `.env.example` | Lines 17–22, 59 | **Configuration** | Lists optional `RAZORPAY_KEY_ID` under legacy section. |

---

## 3. Analysis of Currently Running Application Path

### Before Removal (The Defect):
When a user opened the TrustFabric web app:
1. The **Landing Page** prominently promoted Razorpay Test Checkout in multiple hero buttons and feature cards.
2. Clicking **"Donate"** routed the user to `DonationView.tsx`.
3. In `DonationView.tsx`, the UI provided a tab for Razorpay checkout, pre-filled with ₹500.
4. Clicking "Proceed to Razorpay Checkout" called `POST /api/payments/razorpay/orders`, requiring the backend to communicate with Razorpay servers and load `checkout.js`.
5. Payment completion depended on `POST /api/payments/razorpay/verify` checking Razorpay's HMAC signature.

### After Removal (The Decentralized Architecture):
1. **Landing Page**: All Razorpay marketing copy, buttons, and badges are **completely removed**. The landing page directly highlights **"Direct On-Chain Web3 Donations on Ethereum Sepolia"**, zero platform fees, and self-custody wallet settlement.
2. Clicking **"Donate Now"** routes directly to the **Pure On-Chain Web3 Donation Flow** and **Live Real-Time Transaction Tracker**.
3. **Donation View**:
   - Razorpay tab and checkout buttons are **eliminated** from the donation interface.
   - User connects their injected wallet (MetaMask / Rabby / Coinbase Wallet).
   - Application verifies connection to **Ethereum Sepolia (Chain ID 11155111)**.
   - User reviews campaign details, recipient address, and enters donation amount (ETH).
   - User signs the native transaction in their wallet; no server API orders or payment gateways are touched.
   - Live **Real-Time Transaction Tracker** monitors the real Sepolia transaction from `PENDING` to `MINED` to `CONFIRMED`, decodes the `DonationReceived` contract event, and links directly to Sepolia Etherscan.
4. **Standalone Independent Verifier**:
   - Judges can paste any Sepolia transaction hash to independently verify the contract execution and event arguments directly from the blockchain RPC.
5. **Historical Integrity**:
   - Historical database records and legacy backend routes remain read-only for audit preservation, but are zero-traffic for active cryptocurrency donations.
