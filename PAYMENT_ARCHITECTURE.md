# TrustFabric: Multi-Rail Payment Architecture Specification

## Executive Summary

TrustFabric operates a transparent **multi-rail settlement architecture** designed to maximize financial decentralization while retaining honest real-world auditability for traditional fiat contributions.

1. **Native Cryptocurrency Rail (`CRYPTO_EVM_ETH`)**: Primary trustless donation rail via direct Ethereum smart contract invocation.
2. **ERC-20 Token Rail (`CRYPTO_EVM_ERC20`)**: Safe multi-stablecoin donations with strict token allowlisting, SafeERC20 low-level semantics, and contract accounting.
3. **Direct Bank Transfer Rail (`DIRECT_BANK_AUDIT`)**: Honest, zero-intermediary-fee INR donation rail using banking UTR nullifiers and on-chain cryptographic commitment anchoring.
4. **Legacy Payment Gateway (`RAZORPAY_LEGACY`)**: Isolated sandbox mode for testing legacy card/UPI checkout flows with preserved historical records.

---

## 1. Primary Rail: Direct Native ETH Donations

### 1.1 Architecture & Contract Execution
Donors execute donations directly from self-custody Web3 wallets (MetaMask, Coinbase Wallet, Rabby, WalletConnect) to `TrustFabric.sol`:

```
[Donor Wallet] 
      |
      |  1. eth_sendTransaction: donate(bytes32 campaignId) { value: amount }
      v
[TrustFabric.sol]
      |
      |-- Checks: campaign exists, isActive, msg.value > 0
      |-- State Update: campaigns[campaignId].totalDonatedWei += msg.value
      |-- Non-Reentrant Guard (ReentrancyGuard)
      |-- Transfer: recipient.call{value: msg.value}("")
      |-- Event: emit DonationReceived(msg.sender, campaignId, recipient, msg.value, timestamp, blockNumber)
      v
[Campaign Recipient EOA / Multisig]
```

### 1.2 Failure & Reentrancy Mitigations
- **Direct Atomic Forwarding**: Funds are never pooled in the contract; they are forwarded immediately to the registered recipient.
- **`ReentrancyGuard`**: Protects against malicious recipient fallback hooks attempting to hijack execution.
- **Zero Intermediary Risk**: No centralized backend can censor, freeze, or skim native ETH donations.

---

## 2. Multi-Token ERC-20 Stablecoin Architecture

### 2.1 The ERC-20 Nonstandard Quirk & SafeERC20 Solution
Many widely used stablecoins (notably Tether USD / USDT on Ethereum) **do not return a boolean `true`** on `transfer` or `transferFrom`, violating the strict ERC-20 specification. Standard OpenZeppelin or naive Solidity calls like `require(IERC20(token).transferFrom(...))` will revert because they expect a 32-byte boolean return value.

To resolve this safely without adding external heavy dependencies, `TrustFabric.sol` implements an internal `_safeTransferFrom` using low-level calls:

```solidity
function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
    (bool success, bytes memory data) = token.call(
        abi.encodeWithSelector(0x23b872dd, from, to, amount) // transferFrom(address,address,uint256)
    );
    if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
        revert TokenTransferFailed();
    }
}
```

### 2.2 Security Invariants for Token Donations
1. **Token Allowlisting**: Only vetted stablecoins (e.g., USDC, USDT, DAI) approved via `setTokenAllowed(token, true)` by the contract owner can be donated. Arbitrary malicious tokens or fake tokens cannot be donated.
2. **Campaign State Validation**: The campaign must exist and be active.
3. **Decimals Handling**: The frontend normalizes decimals (e.g. 6 decimals for USDC/USDT, 18 decimals for DAI) before requesting wallet approvals.
4. **Fee-on-Transfer Protection**: Because TrustFabric routes tokens directly to the campaign recipient via `_safeTransferFrom(token, msg.sender, c.recipient, amount)`, the recipient receives the net transferred tokens.

---

## 3. Direct Bank Transfer Rail (Honest Fiat Settlement)

### 3.1 Transparent Reality vs False "Decentralization"
Bank transfers via NEFT, RTGS, IMPS, or UPI are cleared through the Reserve Bank of India (RBI) and National Payments Corporation of India (NPCI). **No platform can honestly claim that UPI or bank transfers are "decentralized."**

TrustFabric solves the fiat trust problem not by pretending fiat is crypto, but by **eliminating centralized payment aggregator fees (0% platform fee)** and **cryptographically anchoring bank settlement evidence on-chain**.

### 3.2 UTR Nullifier and Cryptographic Commitment Flow
```
[Donor] transfers funds via bank app directly to verified NGO account (e.g. Jal Jeevan Relief)
      |
      |-- Donor receives Bank UTR / RRN (Unique Transaction Reference, e.g. "SBIN004829104821")
      v
[TrustFabric Direct Bank Portal]
      |
      |-- Donor inputs: Grant Code, Amount (INR), Bank UTR, Transfer Date
      |-- Client/Backend computes UTR Nullifier: keccak256(utr + grantId)
      |-- Server checks utrIndex: Rejects duplicate/replayed UTRs
      v
[Sepolia Relayer Queue]
      |
      |-- Generates salted commitment: keccak256(grantRefHash, paymentCommitment, amountPaise, "INR")
      |-- Relayer calls: recordFiatDonation(grantRefHash, paymentCommitment, amountPaise, "INR")
      v
[TrustFabric.sol on Sepolia]
      |-- Immutable on-chain anchor: anchors[paymentCommitment] = PaymentAnchor(...)
      |-- Event: emit FiatDonationAnchored(...)
```

### 3.3 Anti-Fraud Guarantee
- The same bank UTR cannot be submitted more than once or claimed across multiple grants.
- Auditors can cross-reference the on-chain `FiatDonationAnchored` event against the NGO's official bank statement.

---

## 4. Historical Razorpay Record Preservation

- All existing Razorpay orders, webhook logs, and verification receipts stored in the system are **preserved in read-only tables**.
- Razorpay API credentials are completely optional; the backend initializes seamlessly without them.
- When Razorpay is unconfigured, attempting to create an order returns a clear, actionable error: `RAZORPAY_NOT_CONFIGURED: Native Web3 crypto or Direct Bank transfer are the primary active rails.`
- Historical records are never deleted or relabeled as blockchain transactions.
