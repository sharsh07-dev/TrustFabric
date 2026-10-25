# AidFlow — Transparent On-Chain Aid Distribution Protocol

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built on Stellar](https://img.shields.io/badge/Built%20on-Stellar-blue)](https://stellar.org)
[![Soroban](https://img.shields.io/badge/Smart%20Contracts-Soroban-purple)](https://soroban.stellar.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> Rebuilding trust in humanitarian aid through radical on-chain transparency.

---

## Table of Contents

- [Overview](#overview)
- [Problem Statement](#problem-statement)
- [Why Stellar?](#why-stellar)
- [Architecture](#architecture)
- [Smart Contract Modules](#smart-contract-modules)
- [Setup & Installation](#setup--installation)
- [Deploying Contracts](#deploying-contracts)
- [SDK Usage](#sdk-usage)
- [Example Use Case](#example-use-case)
- [Roadmap](#roadmap)
- [Why Contribute?](#why-contribute)
- [License](#license)

---

## Overview

**AidFlow** is an open-source, transparent aid distribution protocol built on the [Stellar](https://stellar.org) network using [Soroban](https://soroban.stellar.org) smart contracts.

It enables NGOs, humanitarian organizations, governments, and communities to:

- Accept donations from individuals or institutions
- Register and verify beneficiaries
- Allocate funds with traceable on-chain logic
- Release funds conditionally based on milestones
- Expose a fully transparent audit trail — publicly verifiable by anyone

The protocol is intentionally modular, meaning individual components can be adopted independently or assembled as a full system.

---

## Problem Statement

### The Broken Trust in Aid Distribution

Every year, **hundreds of billions of dollars** flow through humanitarian aid pipelines — yet a disproportionate share never reaches its intended recipients. Studies by organizations like Transparency International and Oxfam consistently reveal:

- **Leakage and corruption** at intermediary levels
- **Zero verifiability** for donors — no way to confirm funds reached a beneficiary
- **No on-chain accountability** for NGOs or local distributors
- **Duplicated disbursements** — the same person receiving aid multiple times
- **Opaque auditing** — organizations auditing themselves

The consequences are devastating. People in crisis receive less help than was donated for them. Donor trust erodes. Organizations lose funding.

**AidFlow's thesis:** If fund movement is on-chain, it is verifiable by default. Transparency becomes a protocol property, not an organization's promise.

---

## Why Stellar?

Stellar is uniquely positioned as the infrastructure for humanitarian finance:

| Property | Why It Matters for Aid |
|---|---|
| **Near-zero fees** | Micropayments to individual beneficiaries remain economically viable |
| **3–5 second finality** | Funds move in real time — critical in crises |
| **XLM and stablecoins** | USDC on Stellar avoids volatility risk for recipients |
| **Global reach** | Stellar's anchor network connects to 180+ countries and local payment rails |
| **Soroban smart contracts** | Full programmability for conditional and milestone-based logic |
| **Regulatory-friendly design** | Stellar's compliance tooling aligns with financial regulations |

Stellar's anchor ecosystem means a beneficiary in rural Nigeria or rural Bangladesh can receive funds in their local currency, directly, within seconds of an on-chain distribution.

---

## Architecture

AidFlow is built as a set of loosely coupled Soroban smart contracts. Each module handles a single responsibility and exposes a clean interface.

```
┌─────────────────────────────────────────────────────────┐
│                     AidFlow Protocol                     │
│                                                          │
│  ┌──────────────┐     ┌─────────────────────────────┐   │
│  │  FundPool    │────▶│     Distribution Engine     │   │
│  │  Contract    │     │  (allocates + routes funds) │   │
│  └──────────────┘     └──────────────┬──────────────┘   │
│                                      │                   │
│  ┌──────────────┐     ┌──────────────▼──────────────┐   │
│  │  Milestone   │────▶│    Beneficiary Registry     │   │
│  │  Engine      │     │  (verified recipients)      │   │
│  └──────────────┘     └─────────────────────────────┘   │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │               Audit / Tracking Module              │  │
│  │       (logs all events, exposes history)           │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Data flow:**
1. Donor calls `donate()` on FundPool → funds locked in contract
2. Admin calls `registerBeneficiary()` on Registry → recipient verified
3. Admin calls `allocateFunds()` on Distribution → allocation recorded
4. Milestone Engine evaluates conditions (manual approval or flag)
5. `releaseFunds()` triggers transfer to beneficiary
6. Audit module logs every action, queryable by anyone

---

## Smart Contract Modules

### 1. FundPool Contract (`contracts/fund_pool`)

Accepts and holds donor contributions. Tracks total donated, allocated, and released amounts.

**Key functions:**
- `donate(donor: Address, amount: i128)` — accept a donation
- `get_total_funds()` — query total available funds
- `get_donor_history(donor: Address)` — per-donor ledger

### 2. Distribution Engine (`contracts/distribution`)

Routes funds from the pool to registered beneficiaries. Supports multi-recipient allocation in a single transaction.

**Key functions:**
- `allocate_funds(beneficiary: Address, amount: i128)` — record allocation
- `release_funds(beneficiary: Address)` — execute payout
- `get_allocations()` — list all pending allocations

### 3. Beneficiary Registry (`contracts/beneficiary_registry`)

Stores recipient metadata and verification status. Acts as the source of truth for who can receive funds.

**Key functions:**
- `register_beneficiary(address: Address, metadata: BeneficiaryMetadata)` — add recipient
- `verify_beneficiary(address: Address)` — mark as verified
- `get_beneficiary(address: Address)` — fetch details
- `list_beneficiaries()` — return all registered recipients

### 4. Milestone / Condition Engine (`contracts/milestone_engine`)

Enforces rules before funds can be released. Currently supports manual approval and simple boolean flags. Designed to be extended with complex automation.

**Key functions:**
- `create_milestone(beneficiary: Address, condition: MilestoneCondition)` — define a release condition
- `approve_milestone(milestone_id: u32)` — manually approve
- `is_milestone_met(milestone_id: u32)` — check condition status

### 5. Audit / Tracking Module (`contracts/audit`)

Immutable event log for all protocol actions. Every donation, allocation, and release is recorded with a timestamp and actor address.

**Key functions:**
- `log_event(event: AuditEvent)` — internal, called by other contracts
- `get_fund_flow_history()` — full chronological event list
- `get_events_by_beneficiary(address: Address)` — filtered history

---

## Setup & Installation

### Prerequisites

- [Rust](https://rustup.rs/) (stable, 1.74+)
- [Soroban CLI](https://soroban.stellar.org/docs/getting-started/setup)
- [Node.js](https://nodejs.org/) 18+ (for SDK)
- A Stellar testnet account ([Stellar Laboratory](https://laboratory.stellar.org))

### Install Soroban CLI

```bash
cargo install --locked soroban-cli
```

### Clone and Build

```bash
git clone https://github.com/your-org/aidflow.git
cd aidflow

# Build all contracts
./scripts/build.sh

# Or build individually
cd contracts/fund_pool
cargo build --target wasm32-unknown-unknown --release
```

### Run Tests

```bash
# All contracts
./scripts/test.sh

# Individual contract
cd contracts/fund_pool
cargo test
```

---

## Deploying Contracts

### Configure Testnet Identity

```bash
soroban keys generate --global alice --network testnet
soroban keys address alice
# Fund the account via Friendbot:
# https://friendbot.stellar.org/?addr=<YOUR_ADDRESS>
```

### Deploy to Testnet

```bash
# Deploy FundPool
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/fund_pool.wasm \
  --source alice \
  --network testnet

# Save the contract ID returned, e.g.:
export FUND_POOL_ID=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

Repeat for each contract. See `scripts/deploy.sh` for automated deployment.

### Initialize Contracts

```bash
soroban contract invoke \
  --id $FUND_POOL_ID \
  --source alice \
  --network testnet \
  -- initialize \
  --admin $(soroban keys address alice) \
  --token USDC_CONTRACT_ID
```

---

## SDK Usage

The TypeScript SDK (`sdk/`) wraps all contract interactions.

### Install

```bash
cd sdk
npm install
npm run build
```

### Example: Full Donor → Beneficiary Flow

```typescript
import { AidFlowClient } from './sdk/src';
import { Keypair } from '@stellar/stellar-sdk';

const client = new AidFlowClient({
  networkPassphrase: 'Test SDF Network ; September 2015',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  contracts: {
    fundPool: 'CXXXXXXXXXXXXXXXXXXXXXXX',
    distribution: 'CXXXXXXXXXXXXXXXXXXXXXXX',
    registry: 'CXXXXXXXXXXXXXXXXXXXXXXX',
    milestone: 'CXXXXXXXXXXXXXXXXXXXXXXX',
    audit: 'CXXXXXXXXXXXXXXXXXXXXXXX',
  }
});

const donorKeypair = Keypair.fromSecret('SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');

// Donate 100 USDC
await client.fundPool.donate({
  donor: donorKeypair.publicKey(),
  amount: BigInt(100_000_000), // 100 USDC in stroops
  keypair: donorKeypair,
});

// Register a beneficiary
await client.registry.registerBeneficiary({
  address: 'GBENEFICIARY...',
  metadata: {
    name: 'Amina Hassan',
    region: 'Northern Nigeria',
    category: 'food_security',
  },
  keypair: adminKeypair,
});

// Allocate funds
await client.distribution.allocateFunds({
  beneficiary: 'GBENEFICIARY...',
  amount: BigInt(50_000_000),
  keypair: adminKeypair,
});

// Release funds (after milestone approval)
await client.distribution.releaseFunds({
  beneficiary: 'GBENEFICIARY...',
  keypair: adminKeypair,
});

// Query audit trail
const history = await client.audit.getFundFlowHistory();
console.log(history);
```

---

## Example Use Case

### Scenario: NGO Distributing Food Security Funds in Northern Nigeria

**Organization:** Nourish Africa Initiative  
**Donor:** German Federal Foreign Office (€500,000 grant, converted to USDC)  
**Recipients:** 2,400 registered households in Kano and Katsina states

**Flow:**

1. Nourish Africa deploys AidFlow contracts on Stellar mainnet
2. German government donor transfers USDC to `FundPool` contract
3. Field officers register 2,400 verified households in `BeneficiaryRegistry` (NIN verification off-chain, hash stored on-chain)
4. Admin sets milestones: fund release triggered by field officer manual approval per household
5. Distribution engine allocates ~208 USDC per household
6. Each household receives funds instantly to their Stellar wallet
7. Donor can query `getFundFlowHistory()` at any time to see exactly which household received what and when
8. Audit trail is public and immutable — any journalist, regulator, or citizen can verify

**Result:** Zero middlemen. Immutable proof of delivery. Full donor visibility.

---

## Roadmap

The following features are intentionally left for community contributors:

### v0.2 — Identity & Verification
- [ ] ZK-proof based identity verification (privacy-preserving KYC)
- [ ] Integration with Stellar's account flags for compliance
- [ ] Duplicate beneficiary detection

### v0.3 — Automation & Oracles
- [ ] Oracle-based milestone triggers (e.g., weather data, market prices)
- [ ] Time-locked automatic releases
- [ ] Multi-sig approval workflows

### v0.4 — Analytics & Reporting
- [ ] On-chain analytics aggregation
- [ ] Distribution fairness scoring
- [ ] Real-time dashboard (React frontend)

### v0.5 — Fraud Prevention
- [ ] Anomaly detection heuristics
- [ ] Blacklist registry for known bad actors
- [ ] Cross-campaign duplicate detection

### v1.0 — Production Hardiness
- [ ] Formal verification of core contracts
- [ ] Full security audit
- [ ] Multi-currency support
- [ ] DAO governance for protocol upgrades

---

## Why Contribute?

AidFlow sits at the intersection of **open-source**, **DeFi infrastructure**, and **real-world humanitarian impact**. Here's why this is worth your time:

- **Real-world stakes** — every improvement to this protocol directly improves how aid reaches people in crisis
- **Cutting-edge stack** — Soroban is Stellar's newest smart contract platform; early contributors gain deep expertise before the ecosystem is crowded
- **Approachable codebase** — we've intentionally kept modules small and well-commented; first-time Soroban contributors are welcome
- **Recognized contributions** — contributors are listed in `CONTRIBUTORS.md` and credited in release notes
- **Potential funding** — this project is designed to align with grant programs (Stellar Community Fund, Drips Wave, etc.)

See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

*Built with care for the communities that need it most.*
