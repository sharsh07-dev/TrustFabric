//! # Audit / Tracking Module
//!
//! The Audit contract maintains an immutable, append-only log of all
//! significant protocol events. It provides the transparency layer that
//! makes AidFlow trustworthy to donors, regulators, and beneficiaries.
//!
//! ## Design Principles
//! - Events are never deleted or modified
//! - Anyone can query the full event history
//! - Events are indexed by both global sequence and beneficiary address
//!
//! ## TODO (Contributors Welcome)
//! - TODO(intermediate): Add event filtering by type (donation, allocation, release)
//! - TODO(intermediate): Add date range filtering using ledger sequences
//! - TODO(advanced): Implement a Merkle tree root for compact audit proof generation
//! - TODO(advanced): Off-chain indexer integration for efficient querying
//! - TODO(protocol-design): Define an event standard for cross-chain audit portability
//! - TODO(analytics): Build summary statistics (total donated, total released, efficiency ratio)

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, Vec,
};

// ─── Data Types ──────────────────────────────────────────────────────────────

/// The type of event being logged.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum AuditEventType {
    /// A donor made a deposit to the FundPool
    Donation = 0,
    /// Admin allocated funds to a beneficiary
    Allocation = 1,
    /// Funds were released to a beneficiary
    Release = 2,
    /// A beneficiary was registered
    BeneficiaryRegistered = 3,
    /// A beneficiary was verified
    BeneficiaryVerified = 4,
    /// A milestone was approved
    MilestoneApproved = 5,
    /// An allocation was cancelled
    AllocationCancelled = 6,
}

/// A single audit log entry.
#[contracttype]
#[derive(Clone, Debug)]
pub struct AuditEvent {
    /// Sequential event number (global across all events)
    pub event_id: u32,
    /// What type of event this is
    pub event_type: AuditEventType,
    /// The primary actor (donor, admin, etc.)
    pub actor: Address,
    /// The affected beneficiary (if applicable; otherwise same as actor)
    pub subject: Address,
    /// Token amount involved (0 if not applicable)
    pub amount: i128,
    /// Ledger sequence number — serves as an on-chain timestamp
    pub ledger: u32,
    /// Optional reference ID (allocation_id, milestone_id, etc.)
    pub ref_id: u32,
}

/// Error codes for the Audit contract.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum AuditError {
    NotInitialized = 1,
    Unauthorized = 2,
    EventNotFound = 3,
    AlreadyInitialized = 4,
}

// ─── Contract ────────────────────────────────────────────────────────────────

#[contract]
pub struct AuditModule;

#[contractimpl]
impl AuditModule {
    /// Initialize the audit module.
    ///
    /// # Arguments
    /// * `admin` - The admin address
    /// * `authorized_loggers` - Addresses permitted to log events (other contracts)
    pub fn initialize(
        env: Env,
        admin: Address,
        authorized_loggers: Vec<Address>,
    ) -> Result<(), AuditError> {
        if env.storage().instance().has(&symbol_short!("admin")) {
            return Err(AuditError::AlreadyInitialized);
        }

        admin.require_auth();
        env.storage().instance().set(&symbol_short!("admin"), &admin);
        env.storage()
            .instance()
            .set(&symbol_short!("loggers"), &authorized_loggers);
        env.storage().instance().set(&symbol_short!("evt_n"), &0u32);

        Ok(())
    }

    /// Log a new audit event.
    ///
    /// Only authorized contract addresses (FundPool, Distribution, Registry, etc.)
    /// can write to the audit log. The admin can also authorize new loggers.
    ///
    /// # Arguments
    /// * `event_type` - Category of event
    /// * `actor` - Who performed the action
    /// * `subject` - Who was affected (beneficiary)
    /// * `amount` - Token amount (0 if not applicable)
    /// * `ref_id` - Reference to a related allocation or milestone ID
    pub fn log_event(
        env: Env,
        event_type: AuditEventType,
        actor: Address,
        subject: Address,
        amount: i128,
        ref_id: u32,
    ) -> Result<u32, AuditError> {
        Self::assert_initialized(&env)?;

        // Only authorized loggers can write
        // TODO(security): Verify that actor is an authorized logger contract address
        // For now, actor requires_auth as a basic guard
        actor.require_auth();

        let event_id: u32 = env
            .storage()
            .instance()
            .get(&symbol_short!("evt_n"))
            .unwrap_or(0);

        let event = AuditEvent {
            event_id,
            event_type,
            actor: actor.clone(),
            subject: subject.clone(),
            amount,
            ledger: env.ledger().sequence(),
            ref_id,
        };

        // Store event by global ID
        let key = (symbol_short!("evt"), event_id);
        env.storage().persistent().set(&key, &event);

        // Increment global event counter
        env.storage()
            .instance()
            .set(&symbol_short!("evt_n"), &(event_id + 1));

        // Index event by beneficiary for efficient per-beneficiary queries
        let bkey = (symbol_short!("bevt"), subject.clone());
        let mut blist: Vec<u32> = env
            .storage()
            .persistent()
            .get(&bkey)
            .unwrap_or(Vec::new(&env));
        blist.push_back(event_id);
        env.storage().persistent().set(&bkey, &blist);

        // Emit a contract event for off-chain indexers
        env.events().publish(
            (symbol_short!("audit"), event_type),
            (event_id, actor, subject, amount),
        );

        Ok(event_id)
    }

    /// Fetch a specific event by its ID.
    pub fn get_event(env: Env, event_id: u32) -> Result<AuditEvent, AuditError> {
        let key = (symbol_short!("evt"), event_id);
        env.storage()
            .persistent()
            .get(&key)
            .ok_or(AuditError::EventNotFound)
    }

    /// Fetch the full event history (all events, chronological order).
    ///
    /// WARNING: This becomes expensive at large event counts.
    /// TODO(intermediate): Add pagination support (cursor + page_size params)
    pub fn get_fund_flow_history(env: Env) -> Result<Vec<AuditEvent>, AuditError> {
        Self::assert_initialized(&env)?;

        let total: u32 = env
            .storage()
            .instance()
            .get(&symbol_short!("evt_n"))
            .unwrap_or(0);

        let mut history = Vec::new(&env);

        for i in 0..total {
            let key = (symbol_short!("evt"), i);
            if let Some(event) = env.storage().persistent().get::<_, AuditEvent>(&key) {
                history.push_back(event);
            }
        }

        Ok(history)
    }

    /// Fetch all events related to a specific beneficiary.
    ///
    /// # Arguments
    /// * `address` - The beneficiary address to query
    pub fn get_events_by_beneficiary(
        env: Env,
        address: Address,
    ) -> Result<Vec<AuditEvent>, AuditError> {
        Self::assert_initialized(&env)?;

        let bkey = (symbol_short!("bevt"), address);
        let event_ids: Vec<u32> = env
            .storage()
            .persistent()
            .get(&bkey)
            .unwrap_or(Vec::new(&env));

        let mut events = Vec::new(&env);
        for id in event_ids.iter() {
            let key = (symbol_short!("evt"), id);
            if let Some(event) = env.storage().persistent().get::<_, AuditEvent>(&key) {
                events.push_back(event);
            }
        }

        Ok(events)
    }

    /// Returns the total number of logged events.
    pub fn get_event_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&symbol_short!("evt_n"))
            .unwrap_or(0)
    }

    // ─── Internal Helpers ──────────────────────────────────────────────────

    fn assert_initialized(env: &Env) -> Result<(), AuditError> {
        if !env.storage().instance().has(&symbol_short!("admin")) {
            return Err(AuditError::NotInitialized);
        }
        Ok(())
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, vec, Address, Env};

    fn setup(env: &Env) -> (Address, AuditModuleClient) {
        env.mock_all_auths();
        let admin = Address::generate(env);
        let contract_id = env.register_contract(None, AuditModule);
        let client = AuditModuleClient::new(env, &contract_id);
        let loggers: Vec<Address> = vec![env, admin.clone()];
        client.initialize(&admin, &loggers).unwrap();
        (admin, client)
    }

    #[test]
    fn test_log_event_and_retrieve() {
        let env = Env::default();
        let (admin, client) = setup(&env);
        let beneficiary = Address::generate(&env);

        let event_id = client
            .log_event(
                &AuditEventType::Donation,
                &admin,
                &beneficiary,
                &500_000_000i128,
                &0u32,
            )
            .unwrap();

        let event = client.get_event(&event_id).unwrap();
        assert_eq!(event.event_type, AuditEventType::Donation);
        assert_eq!(event.amount, 500_000_000);
    }

    #[test]
    fn test_event_count_increments() {
        let env = Env::default();
        let (admin, client) = setup(&env);
        let b = Address::generate(&env);

        client.log_event(&AuditEventType::Donation, &admin, &b, &100i128, &0).unwrap();
        client.log_event(&AuditEventType::Allocation, &admin, &b, &100i128, &1).unwrap();

        assert_eq!(client.get_event_count(), 2);
    }

    #[test]
    fn test_get_events_by_beneficiary() {
        let env = Env::default();
        let (admin, client) = setup(&env);
        let b1 = Address::generate(&env);
        let b2 = Address::generate(&env);

        client.log_event(&AuditEventType::Donation, &admin, &b1, &100i128, &0).unwrap();
        client.log_event(&AuditEventType::Donation, &admin, &b2, &200i128, &0).unwrap();
        client.log_event(&AuditEventType::Release, &admin, &b1, &100i128, &1).unwrap();

        let b1_events = client.get_events_by_beneficiary(&b1).unwrap();
        assert_eq!(b1_events.len(), 2);

        let b2_events = client.get_events_by_beneficiary(&b2).unwrap();
        assert_eq!(b2_events.len(), 1);
    }

    #[test]
    fn test_get_fund_flow_history() {
        let env = Env::default();
        let (admin, client) = setup(&env);
        let b = Address::generate(&env);

        client.log_event(&AuditEventType::Donation, &admin, &b, &100i128, &0).unwrap();
        client.log_event(&AuditEventType::Release, &admin, &b, &100i128, &0).unwrap();

        let history = client.get_fund_flow_history().unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history.get(0).unwrap().event_type, AuditEventType::Donation);
        assert_eq!(history.get(1).unwrap().event_type, AuditEventType::Release);
    }

    // TODO(contributor): Test that unauthorized address cannot log events
    // TODO(contributor): Test get_event with nonexistent ID returns EventNotFound
}
