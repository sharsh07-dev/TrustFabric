# AidFlow GitHub Issues

A curated list of 25 high-quality open issues for community contributors.
Copy each issue title and body into GitHub when publishing the repository.

---

## 🟢 Beginner Issues (`good first issue`)

---

### Issue #1
**Title:** `[docs] Add inline code comments to milestone_engine.rs explaining condition evaluation flow`

**Labels:** `good first issue`, `documentation`

**Description:**
The `is_milestone_met()` function evaluates conditions through a `match` block, but new contributors may not immediately understand the evaluation model — especially why `TimeUnlock` auto-updates state.

Add inline comments to the `is_milestone_met()` function body explaining:
1. Why the state is updated inside the view function for `TimeUnlock`
2. The difference in caller semantics between `ManualApproval` and `TimeUnlock`
3. Why we return `Ok(false)` vs `Err(...)` when a condition is not yet met

**Expected outcome:** A first-time Soroban reader can understand the function without reading other files.

---

### Issue #2
**Title:** `[docs] Add getting-started example in examples/ folder with full donor → release flow`

**Labels:** `good first issue`, `documentation`

**Description:**
There is currently no runnable end-to-end example. Create `examples/full_flow.ts` that demonstrates:

1. Creating a client with testnet config
2. Donating to the fund pool
3. Registering and verifying a beneficiary
4. Creating a ManualApproval milestone
5. Allocating funds
6. Approving the milestone
7. Releasing funds
8. Querying the audit trail

The example should use the SDK and include comments explaining each step.

**Expected outcome:** A developer can clone the repo, configure testnet credentials, and run the example end-to-end.

---

### Issue #3
**Title:** `[test] Add missing unit tests for FundPool: unauthorized withdrawal and excess withdrawal`

**Labels:** `good first issue`

**Description:**
The `fund_pool` test suite has TODOs for two missing tests:
- `test_unauthorized_withdrawal`: Assert that calling `withdraw_for_distribution()` from an address that is NOT the distributor returns `Unauthorized`
- `test_excess_withdrawal`: Assert that withdrawing more than `total_funds` returns `InsufficientFunds`

Write both tests following the existing test patterns in `contracts/fund_pool/src/lib.rs`.

**Expected outcome:** Both tests are added and pass with `cargo test`.

---

### Issue #4
**Title:** `[test] Add missing unit tests for BeneficiaryRegistry`

**Labels:** `good first issue`

**Description:**
The registry test suite is missing two test cases marked as TODOs:
1. Verify that calling `register_beneficiary()` from a non-admin address fails with `Unauthorized`
2. Verify that `get_beneficiary()` for an unknown address returns `BeneficiaryNotFound`

**Expected outcome:** Both tests pass with `cargo test` in `contracts/beneficiary_registry`.

---

### Issue #5
**Title:** `[sdk] Add JSDoc comments to all exported SDK functions`

**Labels:** `good first issue`, `documentation`

**Description:**
The TypeScript SDK in `sdk/src/index.ts` has several exported functions that lack JSDoc documentation:
- `FundPoolClient.getTotalFunds()`
- `RegistryClient.listBeneficiaries()`
- `DistributionClient.getBeneficiaryAllocations()`
- `AuditClient.getEventCount()`
- `AuditClient.getEvent()`

Add `@param`, `@returns`, and `@throws` documentation to each.

**Expected outcome:** Running `npm run build` in `/sdk` shows no type errors, and all public functions have full JSDoc.

---

### Issue #6
**Title:** `[scripts] Create a deploy.sh script for automated testnet deployment`

**Labels:** `good first issue`

**Description:**
Currently deployment requires running `soroban contract deploy` manually for each of the five contracts. Create `scripts/deploy.sh` that:

1. Builds all contracts (`./scripts/build.sh`)
2. Deploys each contract to testnet
3. Stores each contract ID in a `.env.testnet` file
4. Prints a summary of all deployed addresses

Assume the deployer has already configured a Soroban identity named `deployer`.

**Expected outcome:** Running `./scripts/deploy.sh` deploys all five contracts and produces a `.env.testnet` file with all contract IDs.

---

### Issue #7
**Title:** `[docs] Document the storage key naming convention`

**Labels:** `good first issue`, `documentation`

**Description:**
AidFlow uses `symbol_short!()` keys throughout, but the naming rationale is not documented. Soroban's `symbol_short!` has a 10-character limit, so keys like `"distr"` and `"brec"` are abbreviations.

Add a comment block at the top of each contract's `lib.rs` that documents all storage keys used, their full names, and their storage type (`instance` vs `persistent`).

Example format:
```rust
// Storage key reference:
// "admin"  (instance) — Address: contract administrator
// "token"  (instance) — Address: accepted token contract
// "total"  (instance) — i128: total funds in pool
// "dh"     (persistent, keyed by Address) — Vec<DonationRecord>: donor history
```

**Expected outcome:** All five contracts have a storage key reference comment block.

---

## 🟡 Intermediate Issues (`intermediate`)

---

### Issue #8
**Title:** `[feature] Implement cross-contract call: Distribution → Registry.is_eligible()`

**Labels:** `intermediate`

**Description:**
The Distribution Engine's `allocate_funds()` function currently skips the beneficiary eligibility check with a TODO comment. This means it's possible to allocate funds to an unverified or deactivated beneficiary — a critical correctness gap.

Implement the cross-contract call to `BeneficiaryRegistry.is_eligible(beneficiary)` before recording an allocation.

**Implementation notes:**
- Use `env.invoke_contract()` with the registry address stored in instance storage
- The registry address is stored under `symbol_short!("reg")`
- If the result is `false`, return `DistributionError::BeneficiaryNotEligible`
- Add a test that verifies unverified beneficiaries cannot be allocated funds

**Expected outcome:** `allocate_funds()` rejects allocations for non-eligible beneficiaries. New test passes.

---

### Issue #9
**Title:** `[feature] Implement cross-contract call: Distribution → FundPool.withdraw_for_distribution()`

**Labels:** `intermediate`

**Description:**
Currently `release_funds()` transfers tokens assuming the Distribution contract already holds them. In production, funds should remain in the FundPool until the moment of release. Implement the pull from FundPool.

**Implementation notes:**
- `release_funds()` should call `FundPool.withdraw_for_distribution(amount)` via cross-contract invoke
- The FundPool address is stored in instance storage under `symbol_short!("pool")`
- The Distribution contract address must be registered as the `distributor` in FundPool on initialization
- Update the test setup to register the Distribution contract as FundPool's distributor

**Expected outcome:** `release_funds()` pulls funds from FundPool immediately before transfer to beneficiary.

---

### Issue #10
**Title:** `[feature] Implement audit log writes from all contracts`

**Labels:** `intermediate`

**Description:**
The Audit module exists but no other contract currently writes to it. All significant state changes should produce an audit log entry.

Implement cross-contract `log_event()` calls from:
- `FundPool.donate()` → `AuditEventType::Donation`
- `Distribution.allocate_funds()` → `AuditEventType::Allocation`
- `Distribution.release_funds()` → `AuditEventType::Release`
- `Distribution.cancel_allocation()` → `AuditEventType::AllocationCancelled`
- `Registry.register_beneficiary()` → `AuditEventType::BeneficiaryRegistered`
- `Registry.verify_beneficiary()` → `AuditEventType::BeneficiaryVerified`
- `MilestoneEngine.approve_milestone()` → `AuditEventType::MilestoneApproved`

**Expected outcome:** Calling `audit.get_fund_flow_history()` returns a complete record of all protocol events.

---

### Issue #11
**Title:** `[feature] Add pagination to list_beneficiaries() and get_fund_flow_history()`

**Labels:** `intermediate`

**Description:**
Both `BeneficiaryRegistry.list_beneficiaries()` and `AuditModule.get_fund_flow_history()` iterate over unbounded lists. At scale, this will fail or become prohibitively expensive.

Implement cursor-based pagination for both:
- Add `offset: u32` and `limit: u32` parameters to both functions
- Return a `Page<T>` type that includes `items`, `total`, and `has_more`
- Update SDK client functions to support pagination params

**Expected outcome:** Both functions accept pagination parameters and return bounded result sets.

---

### Issue #12
**Title:** `[feature] Add allocation expiry — unclaimed allocations return to pool after N ledgers`

**Labels:** `intermediate`

**Description:**
Currently, a `Pending` allocation sits in storage indefinitely. If a beneficiary address is lost or a mistake is made, funds are locked forever.

Add an `expires_at` field to the `Allocation` struct. If `release_funds()` is called after `expires_at`, the allocation should be automatically cancelled and the amount should be credited back to the FundPool.

**Implementation notes:**
- `expires_at` should be set during `allocate_funds()` as `ledger.sequence() + expiry_ledgers`
- Default `expiry_ledgers` should be a configurable contract parameter (set during `initialize`)
- Add a `reclaim_expired_allocation(allocation_id)` function that anyone can call
- Add tests for expiry behavior

**Expected outcome:** Expired allocations can be reclaimed. Funds do not remain locked indefinitely.

---

### Issue #13
**Title:** `[feature] Implement batch release — release multiple allocations in one transaction`

**Labels:** `intermediate`

**Description:**
Releasing funds to many beneficiaries individually is slow and expensive. Implement `release_funds_batch(allocation_ids: Vec<u32>)` that processes multiple releases in a single transaction.

**Considerations:**
- If one allocation in the batch fails (e.g., milestone not met), should the whole batch fail or skip it?
- Document the chosen behavior in a code comment
- Add a test with a mix of valid and invalid allocation IDs

**Expected outcome:** Admin can release funds to 10+ beneficiaries in a single transaction.

---

### Issue #14
**Title:** `[sdk] Implement proper ScVal deserialization for BeneficiaryRecord and AuditEvent`

**Labels:** `intermediate`

**Description:**
Several SDK functions have `TODO(contributor): Properly deserialize...` comments. The raw return values from Soroban are `scValToNative()` results that need to be mapped to typed TypeScript interfaces.

Implement proper deserialization for:
- `BeneficiaryRecord` (from `registry.getBeneficiary()`)
- `Allocation` (from `distribution.getAllocation()`)
- `AuditEvent` (from `audit.getEvent()` and `audit.getFundFlowHistory()`)
- `DonationRecord` (from `fundPool.getDonorHistory()`)

Add unit tests for each deserialization function.

**Expected outcome:** All SDK getter functions return properly typed objects.

---

### Issue #15
**Title:** `[feature] Add per-campaign fund pooling support`

**Labels:** `intermediate`, `protocol design`

**Description:**
Currently, all donations go into a single global pool. Many NGOs run multiple concurrent campaigns (e.g., "Northern Nigeria Food Aid 2025" vs "Flood Relief Fund").

Extend FundPool to support named campaigns:
- `create_campaign(name: Bytes, target_amount: i128) → campaign_id: u32`
- `donate(donor, amount, campaign_id)` — link donation to a campaign
- `get_campaign_balance(campaign_id) → i128`
- Update Distribution to route withdrawals from a specific campaign

**Expected outcome:** Multiple independent aid campaigns can run simultaneously under one FundPool deployment.

---

---

## 🔴 Advanced Issues (`advanced`)

---

### Issue #16
**Title:** `[feature] Implement multi-sig milestone approval (N-of-M approvers)`

**Labels:** `advanced`, `protocol design`

**Description:**
Currently, milestone approval requires a single admin signature. In practice, organizations require multiple approvers for fund releases (e.g., "2 of 3 field officers must confirm delivery").

Design and implement:
- A new `MultiSigApproval` condition type in the MilestoneEngine
- A `MultiSigConfig` struct: `{ approvers: Vec<Address>, threshold: u32 }`
- `submit_approval(milestone_id)` — any approver can call, counts their vote
- Auto-approve when approval count reaches threshold
- Prevent double-voting by the same approver

**Expected outcome:** Milestones can require multiple independent signers. Single-admin attack vector is removed.

---

### Issue #17
**Title:** `[feature] Implement persistent storage TTL management to prevent data archival`

**Labels:** `advanced`

**Description:**
Soroban persistent storage entries expire if their TTL is not extended. In a long-running protocol, records for active beneficiaries and pending allocations must have their TTL bumped regularly.

Implement:
- A `bump_ttl(entry_key)` internal utility function
- TTL bumping logic in all `get_*` functions for persistent entries (this is the standard Soroban pattern)
- A `maintain_active_records()` admin function that bumps TTL for all non-released allocations
- Document the TTL strategy in `docs/architecture.md`

**Reference:** https://soroban.stellar.org/docs/learn/encyclopedia/storage/state-archival

**Expected outcome:** Active records do not expire. TTL extension is automatic for read paths.

---

### Issue #18
**Title:** `[feature] Implement a ZK-friendly beneficiary identity commitment scheme`

**Labels:** `advanced`, `security`

**Description:**
Currently, beneficiary names and regions are stored as plaintext bytes on-chain, which is a privacy risk. In a production humanitarian system, recipient identities must be protected.

Design and implement:
- A commitment scheme where off-chain identity data is hashed (e.g., `sha256(NIN + nonce)`)
- Only the commitment hash is stored on-chain, not the name
- An off-chain verification service can validate identity against the commitment
- Update `BeneficiaryMetadata` to store `identity_commitment: BytesN<32>` instead of `name: Bytes`
- Document the off-chain verification flow

**Expected outcome:** No personally identifiable information is stored on-chain. Compliance with GDPR and Nigerian NDPA is improved.

---

### Issue #19
**Title:** `[feature] Build an oracle-based milestone condition using a Stellar-compatible oracle`

**Labels:** `advanced`

**Description:**
The `ConditionType` enum has a TODO comment for `OracleVerification`. Implement it.

An oracle-based milestone would be met when a trusted oracle address submits a signed attestation:
- `OracleVerification { oracle: Address, attestation_schema: Bytes }`
- The oracle submits: `submit_oracle_result(milestone_id, result: bool, signature: BytesN<64>)`
- Verify the signature against the oracle address before accepting the result
- This enables automated triggers from external data (weather, delivery confirmation, etc.)

**Expected outcome:** A deployed AidFlow instance can accept oracle-driven milestone resolution without admin intervention.

---

### Issue #20
**Title:** `[security] Audit access control across all five contracts for privilege escalation vectors`

**Labels:** `advanced`, `security`

**Description:**
Conduct a thorough access control review of all five contracts. Specifically:

1. Map all state-modifying functions and their auth requirements
2. Identify any function that should require auth but does not
3. Check that cross-contract calls cannot be spoofed (e.g., can a malicious contract pretend to be the FundPool?)
4. Verify the distributor-only withdrawal restriction in FundPool cannot be bypassed
5. Write a security report as `docs/security-review.md`
6. Open follow-up issues for any findings

**Expected outcome:** A written security report. All access control gaps converted to discrete issues with `security` label.

---

---

## 🔵 Protocol Design Issues (`protocol design`)

---

### Issue #21
**Title:** `[protocol] Design a dispute resolution mechanism for challenged fund releases`

**Labels:** `protocol design`, `advanced`

**Description:**
What happens when a beneficiary claims they didn't receive funds they were allocated? Or when a donor disputes a release they believe was fraudulent?

Design a dispute resolution protocol:
- A `raise_dispute(allocation_id, evidence_hash: BytesN<32>)` function
- A dispute state machine: `Raised → UnderReview → Resolved(outcome)`
- A designated arbitrator address (could be a multi-sig or DAO)
- The ability to clawback funds if the dispute is upheld (within a time window)
- Events emitted at each state transition

Document the design in `docs/dispute-resolution.md` before implementing.

**Expected outcome:** A written protocol design document. Implementation is a separate follow-up.

---

### Issue #22
**Title:** `[protocol] Design a governance model for protocol parameter changes`

**Labels:** `protocol design`, `advanced`

**Description:**
Currently, the admin is a single EOA (externally owned account) with full control. This is not appropriate for a production humanitarian protocol.

Design a governance model:
- What parameters should be governable? (admin address, expiry ledgers, distributor address, etc.)
- Should governance be a separate contract or an extension of the admin role?
- Consider a time-locked admin change (proposal → 48h delay → execution)
- Document tradeoffs between simplicity and decentralization

Write a `docs/governance.md` design document.

**Expected outcome:** A clear governance design document that future contributors can implement against.

---

### Issue #23
**Title:** `[protocol] Define an event standard for cross-chain audit portability`

**Labels:** `protocol design`, `intermediate`

**Description:**
AidFlow's audit events are Soroban-specific. If the protocol expands to other chains (or if events need to be consumed by non-Soroban systems), the event format should be portable.

Define a JSON event schema that:
- Captures all `AuditEventType` variants
- Can be derived from on-chain Soroban events
- Is compatible with common humanitarian data standards (e.g., IATI)
- Document the schema in `docs/event-schema.md`

**Expected outcome:** A published event schema that off-chain systems can use to process AidFlow data.

---

### Issue #24
**Title:** `[protocol] Evaluate and implement Soroban contract upgrade strategy`

**Labels:** `protocol design`, `advanced`

**Description:**
Soroban supports WASM replacement via an `upgrade()` function. AidFlow contracts need an upgrade path for bug fixes and feature additions without losing on-chain state.

Research and implement:
- Add an `upgrade(new_wasm_hash: BytesN<32>)` function to each contract (admin-only)
- Design a state migration strategy for when storage schemas change
- Document the upgrade process in `docs/upgrading.md`
- Consider: should upgrades require a time-lock delay for transparency?

**Expected outcome:** A documented upgrade path. The `upgrade()` function is present and tested.

---

### Issue #25
**Title:** `[protocol] Integrate with Stellar anchor network for local currency payouts`

**Labels:** `protocol design`, `advanced`

**Description:**
AidFlow currently distributes stablecoins (e.g., USDC) to Stellar addresses. In regions where beneficiaries don't have smartphones or crypto wallets, funds need to reach them via local payment rails.

Design the integration with Stellar's SEP-24 anchor network:
- How does AidFlow interact with a local anchor's deposit/withdrawal endpoints?
- Can the protocol record an anchor-based payout as an audit event?
- What additional trust assumptions does an anchor introduce?
- What fallback exists if an anchor goes offline?

Document the design in `docs/anchor-integration.md`.

**Expected outcome:** A written integration design. AidFlow maintainers can evaluate which anchors to partner with.

---

---

## Issue Summary Table

| # | Title (short) | Label | Difficulty |
|---|---|---|---|
| 1 | Inline comments for milestone eval | `good first issue` | ⭐ |
| 2 | Full flow example in examples/ | `good first issue` | ⭐ |
| 3 | FundPool missing unit tests | `good first issue` | ⭐ |
| 4 | Registry missing unit tests | `good first issue` | ⭐ |
| 5 | JSDoc for SDK functions | `good first issue` | ⭐ |
| 6 | deploy.sh script | `good first issue` | ⭐ |
| 7 | Document storage key conventions | `good first issue` | ⭐ |
| 8 | Cross-contract: Distribution → Registry | `intermediate` | ⭐⭐ |
| 9 | Cross-contract: Distribution → FundPool | `intermediate` | ⭐⭐ |
| 10 | Audit log writes from all contracts | `intermediate` | ⭐⭐ |
| 11 | Pagination for list functions | `intermediate` | ⭐⭐ |
| 12 | Allocation expiry logic | `intermediate` | ⭐⭐ |
| 13 | Batch release function | `intermediate` | ⭐⭐ |
| 14 | SDK ScVal deserialization | `intermediate` | ⭐⭐ |
| 15 | Per-campaign fund pooling | `intermediate` | ⭐⭐ |
| 16 | Multi-sig milestone approval | `advanced` | ⭐⭐⭐ |
| 17 | Storage TTL management | `advanced` | ⭐⭐⭐ |
| 18 | ZK identity commitment | `advanced` | ⭐⭐⭐ |
| 19 | Oracle-based milestone | `advanced` | ⭐⭐⭐ |
| 20 | Access control security audit | `security` | ⭐⭐⭐ |
| 21 | Dispute resolution design | `protocol design` | ⭐⭐⭐ |
| 22 | Governance model design | `protocol design` | ⭐⭐⭐ |
| 23 | Cross-chain event standard | `protocol design` | ⭐⭐ |
| 24 | Contract upgrade strategy | `protocol design` | ⭐⭐⭐ |
| 25 | Stellar anchor integration | `protocol design` | ⭐⭐⭐ |
