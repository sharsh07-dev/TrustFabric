# AidFlow Smart Contract Reference

Complete reference for all AidFlow Soroban smart contracts.

---

## FundPool Contract

**File:** `contracts/fund_pool/src/lib.rs`

Accepts and holds donor contributions. The single source of funds for the entire protocol.

### Functions

#### `initialize(admin, token, distributor) → Result<(), FundPoolError>`

Must be called once after deployment. Sets the admin address, the accepted token, and the authorized distributor (the Distribution Engine contract).

| Param | Type | Description |
|---|---|---|
| `admin` | `Address` | Admin who can update config |
| `token` | `Address` | Token contract address (e.g., USDC) |
| `distributor` | `Address` | Distribution Engine contract address |

**Errors:** `AlreadyInitialized`, `Unauthorized`

---

#### `donate(donor, amount) → Result<(), FundPoolError>`

Transfers `amount` tokens from the donor into the contract. Records the donation in persistent storage.

| Param | Type | Description |
|---|---|---|
| `donor` | `Address` | Must sign the transaction |
| `amount` | `i128` | Must be > 0 |

**Auth required:** `donor`  
**Errors:** `NotInitialized`, `InvalidAmount`

---

#### `withdraw_for_distribution(amount) → Result<(), FundPoolError>`

Transfers `amount` tokens to the Distribution Engine. Only the registered distributor may call this.

| Param | Type | Description |
|---|---|---|
| `amount` | `i128` | Amount to withdraw |

**Auth required:** `distributor`  
**Errors:** `Unauthorized`, `InsufficientFunds`

---

#### `get_total_funds() → Result<i128, FundPoolError>`

Returns the total tokens currently held in the pool.

---

#### `get_donor_history(donor) → Result<Vec<DonationRecord>, FundPoolError>`

Returns the full donation history for a given donor address.

---

### Data Types

```rust
pub struct DonationRecord {
    pub donor: Address,
    pub amount: i128,
    pub ledger: u32,
}
```

### Error Codes

| Code | Value | Meaning |
|---|---|---|
| `NotInitialized` | 1 | Contract not initialized |
| `Unauthorized` | 2 | Caller not authorized |
| `InvalidAmount` | 3 | Amount must be > 0 |
| `InsufficientFunds` | 4 | Not enough funds in pool |
| `AlreadyInitialized` | 5 | Initialize called twice |

---

## Beneficiary Registry Contract

**File:** `contracts/beneficiary_registry/src/lib.rs`

Stores and manages the list of eligible aid recipients.

### Functions

#### `initialize(admin) → Result<(), RegistryError>`

Sets the admin who can register and verify beneficiaries.

---

#### `register_beneficiary(address, metadata) → Result<(), RegistryError>`

Registers a new beneficiary. Newly registered beneficiaries are **not verified** — a separate `verify_beneficiary()` call is required.

| Param | Type | Description |
|---|---|---|
| `address` | `Address` | Beneficiary's Stellar address |
| `metadata` | `BeneficiaryMetadata` | Name, region, category |

**Auth required:** `admin`  
**Errors:** `AlreadyRegistered`, `Unauthorized`

---

#### `verify_beneficiary(address) → Result<(), RegistryError>`

Marks a registered beneficiary as verified. Only verified beneficiaries can receive fund releases.

**Auth required:** `admin`

---

#### `deactivate_beneficiary(address) → Result<(), RegistryError>`

Marks a beneficiary as inactive. The record is preserved for audit purposes. Inactive beneficiaries cannot receive new releases.

**Auth required:** `admin`

---

#### `get_beneficiary(address) → Result<BeneficiaryRecord, RegistryError>`

Fetches the full record for a beneficiary.

**Errors:** `BeneficiaryNotFound`

---

#### `list_beneficiaries() → Result<Vec<Address>, RegistryError>`

Returns all registered beneficiary addresses. ⚠️ Unbounded — see TODO in source.

---

#### `is_eligible(address) → bool`

Returns `true` if the address is both verified and active. Used by the Distribution Engine.

---

### Data Types

```rust
pub struct BeneficiaryMetadata {
    pub name: Bytes,
    pub region: Bytes,
    pub category: Bytes,
}

pub struct BeneficiaryRecord {
    pub address: Address,
    pub metadata: BeneficiaryMetadata,
    pub is_verified: bool,
    pub is_active: bool,
    pub registered_at: u32,
}
```

### Error Codes

| Code | Value | Meaning |
|---|---|---|
| `NotInitialized` | 1 | Contract not initialized |
| `Unauthorized` | 2 | Caller not authorized |
| `BeneficiaryNotFound` | 3 | Address not in registry |
| `AlreadyRegistered` | 4 | Address already registered |
| `AlreadyInitialized` | 5 | Initialize called twice |
| `BeneficiaryNotVerified` | 6 | Beneficiary not verified |

---

## Distribution Engine Contract

**File:** `contracts/distribution/src/lib.rs`

Routes funds from the FundPool to verified beneficiaries. The central coordination contract of the protocol.

### Functions

#### `initialize(admin, fund_pool, registry, milestone_engine, token)`

Sets up all contract references. Must be called once after deployment.

---

#### `allocate_funds(beneficiary, amount, milestone_id) → Result<u32, DistributionError>`

Records a fund allocation for a beneficiary. Returns the `allocation_id`.

- `milestone_id = 0` means no condition required before release
- `milestone_id > 0` means `MilestoneEngine.is_milestone_met(milestone_id)` must return `true` before release

**Auth required:** `admin`

---

#### `release_funds(allocation_id) → Result<(), DistributionError>`

Executes the actual fund transfer to the beneficiary.

Checks:
1. Allocation exists and is `Pending`
2. Milestone condition is met (if applicable)
3. Updates status to `Released` BEFORE transfer (re-entrancy protection)
4. Transfers tokens to beneficiary

**Auth required:** `admin`  
**Errors:** `AllocationNotFound`, `AlreadyReleased`, `MilestoneNotMet`

---

#### `cancel_allocation(allocation_id) → Result<(), DistributionError>`

Cancels a pending allocation. Only possible before release.

---

#### `get_allocation(allocation_id) → Result<Allocation, DistributionError>`

Fetches a specific allocation by ID.

---

#### `get_beneficiary_allocations(beneficiary) → Result<Vec<u32>, DistributionError>`

Returns all allocation IDs for a specific beneficiary.

---

### Data Types

```rust
pub enum AllocationStatus {
    Pending = 0,
    Released = 1,
    Cancelled = 2,
}

pub struct Allocation {
    pub beneficiary: Address,
    pub amount: i128,
    pub status: AllocationStatus,
    pub allocated_at: u32,
    pub released_at: u32,
    pub milestone_id: u32,
}
```

---

## Milestone Engine Contract

**File:** `contracts/milestone_engine/src/lib.rs`

Defines and evaluates conditions that must be satisfied before fund release.

### Condition Types

| Type | Value | Behavior |
|---|---|---|
| `ManualApproval` | 0 | Admin must call `approve_milestone()` |
| `TimeUnlock` | 1 | Auto-approves after a target ledger sequence |

### Functions

#### `create_milestone(beneficiary, condition) → Result<u32, MilestoneError>`

Creates a new milestone and returns its ID. The ID is passed to `allocate_funds()` to link the condition to an allocation.

---

#### `approve_milestone(milestone_id) → Result<(), MilestoneError>`

Manually approves a `ManualApproval` milestone. Fails if the condition type is not `ManualApproval`.

**Auth required:** `admin`

---

#### `is_milestone_met(milestone_id) → Result<bool, MilestoneError>`

Returns whether the condition is satisfied. For `TimeUnlock`, auto-updates the stored state if the current ledger has passed the target.

---

#### `get_milestone(milestone_id) → Result<Milestone, MilestoneError>`

Fetches the full milestone record.

---

### Data Types

```rust
pub enum ConditionType {
    ManualApproval = 0,
    TimeUnlock = 1,
}

pub struct MilestoneCondition {
    pub condition_type: ConditionType,
    pub data: u32,
}

pub struct Milestone {
    pub beneficiary: Address,
    pub condition: MilestoneCondition,
    pub is_met: bool,
    pub created_at: u32,
    pub met_at: u32,
}
```

---

## Audit Module Contract

**File:** `contracts/audit/src/lib.rs`

Immutable, append-only event log for the entire protocol.

### Event Types

| Type | Value | Emitted by |
|---|---|---|
| `Donation` | 0 | FundPool |
| `Allocation` | 1 | Distribution Engine |
| `Release` | 2 | Distribution Engine |
| `BeneficiaryRegistered` | 3 | Beneficiary Registry |
| `BeneficiaryVerified` | 4 | Beneficiary Registry |
| `MilestoneApproved` | 5 | Milestone Engine |
| `AllocationCancelled` | 6 | Distribution Engine |

### Functions

#### `log_event(event_type, actor, subject, amount, ref_id) → Result<u32, AuditError>`

Appends a new event to the log. Returns the event ID.

**Auth required:** `actor` (must be an authorized logger contract)

---

#### `get_event(event_id) → Result<AuditEvent, AuditError>`

Fetches a single event by ID.

---

#### `get_fund_flow_history() → Result<Vec<AuditEvent>, AuditError>`

Returns the complete event log. ⚠️ Expensive at high event counts — pagination is a priority TODO.

---

#### `get_events_by_beneficiary(address) → Result<Vec<AuditEvent>, AuditError>`

Returns all events where the given address was the `subject`.

---

#### `get_event_count() → u32`

Returns total number of logged events.

---

### Data Types

```rust
pub struct AuditEvent {
    pub event_id: u32,
    pub event_type: AuditEventType,
    pub actor: Address,
    pub subject: Address,
    pub amount: i128,
    pub ledger: u32,
    pub ref_id: u32,
}
```

---

## Cross-Contract Call Matrix

| Caller | Callee | Function | Status |
|---|---|---|---|
| Distribution | Registry | `is_eligible()` | 🔴 TODO |
| Distribution | FundPool | `withdraw_for_distribution()` | 🔴 TODO |
| Distribution | Audit | `log_event()` | 🔴 TODO |
| FundPool | Audit | `log_event()` | 🔴 TODO |
| Registry | Audit | `log_event()` | 🔴 TODO |
| MilestoneEngine | Audit | `log_event()` | 🔴 TODO |

All six cross-contract calls are excellent intermediate contribution opportunities. See the GitHub issues for implementation specs.
