# AidFlow Architecture

## Overview

AidFlow is designed as a modular, loosely coupled set of Soroban smart contracts.
Each module has a single responsibility and communicates with others through
well-defined cross-contract interfaces.

This document describes the system architecture, the rationale behind key design
decisions, and the intended extension points for contributors.

---

## Module Map

```
┌────────────────────────────────────────────────────────────────────┐
│                            External Actors                          │
│                                                                     │
│   [Donor]          [NGO Admin]         [Beneficiary]   [Auditor]  │
│      │                  │                    │              │      │
└──────┼──────────────────┼────────────────────┼──────────────┼──────┘
       │                  │                    │              │
       ▼                  ▼                    │              ▼
┌─────────────┐   ┌───────────────┐           │   ┌──────────────────┐
│  FundPool   │   │  Beneficiary  │           │   │  Audit Module    │
│  Contract   │   │  Registry     │           │   │  (read-only)     │
│             │   │               │           │   └──────────────────┘
│ donate()    │   │ register()    │           │            ▲
│ withdraw()  │   │ verify()      │           │            │
└──────┬──────┘   └───────┬───────┘           │     (all contracts
       │                  │                   │      write here)
       │                  │                   │
       ▼                  ▼                   │
┌──────────────────────────────────────┐      │
│         Distribution Engine          │      │
│                                      │      │
│  allocate_funds(beneficiary, amount) │      │
│  release_funds(allocation_id)  ──────┼──────┘ (logs event)
└──────────────────────┬───────────────┘
                       │
                       │  checks condition
                       ▼
              ┌─────────────────┐
              │ Milestone Engine │
              │                 │
              │ is_milestone_met│
              │ approve()       │
              └─────────────────┘
```

---

## Data Flow

### Donation Path

1. Donor approves the FundPool contract to spend their tokens
2. Donor calls `FundPool.donate(donor, amount)`
3. FundPool transfers tokens from donor into itself
4. FundPool increments `total_funds`
5. FundPool stores a `DonationRecord` in persistent storage
6. FundPool emits a `donate` event
7. Audit module is notified (TODO: implement cross-contract call)

### Distribution Path

1. Admin calls `Distribution.allocate_funds(beneficiary, amount, milestone_id)`
   - Distribution checks the Registry that the beneficiary is verified and active
   - Distribution stores an `Allocation` record with `Pending` status
2. If `milestone_id != 0`, admin resolves the milestone:
   - For `ManualApproval`: admin calls `MilestoneEngine.approve_milestone(id)`
   - For `TimeUnlock`: milestone auto-resolves when ledger sequence is reached
3. Admin calls `Distribution.release_funds(allocation_id)`
   - Distribution verifies the milestone condition is met
   - Distribution updates allocation status to `Released` BEFORE transferring funds
     (re-entrancy protection pattern)
   - Distribution calls `FundPool.withdraw_for_distribution(amount)` to receive funds
   - Distribution transfers tokens to the beneficiary
   - Audit event is logged

---

## Storage Design

Soroban distinguishes between three storage types. AidFlow uses them deliberately:

| Storage Type | TTL Behavior | Usage in AidFlow |
|---|---|---|
| `instance` | Lives as long as contract exists | Config values (admin, token, distributor) |
| `persistent` | Has a TTL, must be extended | Per-beneficiary records, allocations, events |
| `temporary` | Short TTL, cheapest | Not used currently (see TODO below) |

**Why this matters:** Persistent storage entries expire unless their TTL is extended.
In a long-running protocol, on-chain archival logic must be implemented to prevent
records from becoming inaccessible.

> **TODO(advanced):** Implement TTL extension logic for critical persistent records.
> Entries for active beneficiaries and pending allocations must have their TTL
> bumped periodically, or the data becomes unreadable.

---

## Cross-Contract Calls

The current implementation has several cross-contract calls that are scaffolded
but not fully implemented (marked with TODO in the code):

1. `Distribution → Registry.is_eligible()` — verify beneficiary before allocating
2. `Distribution → FundPool.withdraw_for_distribution()` — pull funds for release
3. `Distribution → Audit.log_event()` — write audit trail
4. `FundPool → Audit.log_event()` — write donation events

These calls are the highest-priority items for contributors to complete.
See the GitHub issues for detailed specs.

---

## Security Considerations

### Access Control
- All state-modifying functions check `admin.require_auth()` using Soroban's native auth system
- The FundPool only allows withdrawals by the registered Distribution contract address
- There is currently no role separation beyond "admin" — see TODOs for multi-role extension

### Re-entrancy
- `release_funds()` updates the allocation status to `Released` BEFORE calling the token transfer
  This prevents re-entrancy attacks where a malicious contract re-enters release_funds

### Known Limitations (Intentional)
- No fraud detection
- No duplicate beneficiary detection
- No rate limiting on releases
- Admin is a single address, not multi-sig

These are documented as contribution opportunities in the GitHub issues.

---

## Extension Points

The architecture is designed with explicit extension points:

| Area | How to Extend |
|---|---|
| New milestone condition types | Add a variant to `ConditionType` enum in `milestone_engine` |
| Additional metadata fields | Add fields to `BeneficiaryMetadata` struct |
| New audit event types | Add a variant to `AuditEventType` enum |
| Multi-token support | Parameterize `token` in FundPool per campaign |
| Multi-admin / DAO | Replace single admin with multi-sig auth or governance contract |

---

## Upgrade Path

Soroban does not natively support contract upgrades with state migration.
AidFlow contracts are designed to be versioned separately, with migration
scripts to transfer state between versions.

> **TODO(protocol-design):** Design a formal upgrade and migration strategy.
> Consider the `upgrade()` function available in Soroban for wasm replacement.
