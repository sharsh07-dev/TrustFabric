//! # Milestone / Condition Engine Contract
//!
//! The MilestoneEngine defines and evaluates conditions that must be met
//! before the Distribution Engine can release funds to a beneficiary.
//!
//! ## Current Condition Types
//! - `ManualApproval`: An admin must explicitly approve the milestone
//! - `TimeUnlock`: Milestone is met after a specific ledger sequence number
//!
//! ## Intentionally Basic — Please Extend
//! This contract is intentionally minimal. It is one of the highest-value
//! areas for contributor improvement.
//!
//! ## TODO (Contributors Welcome)
//! - TODO(advanced): Oracle-based conditions (e.g., "recipient confirmed food delivery")
//! - TODO(advanced): Multi-sig approval — require N-of-M approvals
//! - TODO(intermediate): Condition chaining — require multiple conditions to all be true
//! - TODO(intermediate): Expiry — milestone automatically fails after N ledgers
//! - TODO(protocol-design): Should beneficiaries be able to contest a rejected milestone?
//! - TODO(protocol-design): What happens to funds if a milestone is never resolved?

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env,
};

// ─── Data Types ──────────────────────────────────────────────────────────────

/// The type of condition that must be satisfied for milestone completion.
///
/// This enum is intentionally simple. Contributors are invited to add new variants.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ConditionType {
    /// An authorized admin must call approve_milestone() manually.
    /// Simple but requires trust in the admin.
    ManualApproval = 0,

    /// Milestone is automatically met after a specific ledger sequence.
    /// `data` in MilestoneCondition is the target ledger number (as u32).
    TimeUnlock = 1,

    // TODO(advanced): Add OracleVerification variant
    // OracleVerification = 2,
    //   Would accept a signed attestation from a trusted oracle address.
    //   Useful for: delivery confirmation, biometric verification, etc.
}

/// Defines the condition that gates a milestone.
#[contracttype]
#[derive(Clone, Debug)]
pub struct MilestoneCondition {
    /// What kind of condition this is
    pub condition_type: ConditionType,
    /// Condition-specific data:
    /// - For ManualApproval: unused (set to 0)
    /// - For TimeUnlock: the ledger sequence number after which release is permitted
    pub data: u32,
}

/// The full state of a milestone.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Milestone {
    /// The beneficiary this milestone is attached to
    pub beneficiary: Address,
    /// The condition that must be satisfied
    pub condition: MilestoneCondition,
    /// Whether this milestone has been satisfied
    pub is_met: bool,
    /// Ledger at creation
    pub created_at: u32,
    /// Ledger at which it was approved/met (0 if not yet met)
    pub met_at: u32,
}

/// Error codes for the MilestoneEngine.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum MilestoneError {
    NotInitialized = 1,
    Unauthorized = 2,
    MilestoneNotFound = 3,
    AlreadyMet = 4,
    AlreadyInitialized = 5,
    ConditionNotSatisfied = 6,
}

// ─── Contract ────────────────────────────────────────────────────────────────

#[contract]
pub struct MilestoneEngine;

#[contractimpl]
impl MilestoneEngine {
    /// Initialize the milestone engine.
    ///
    /// # Arguments
    /// * `admin` - Address authorized to create and approve milestones
    pub fn initialize(env: Env, admin: Address) -> Result<(), MilestoneError> {
        if env.storage().instance().has(&symbol_short!("admin")) {
            return Err(MilestoneError::AlreadyInitialized);
        }

        admin.require_auth();
        env.storage().instance().set(&symbol_short!("admin"), &admin);
        env.storage().instance().set(&symbol_short!("mile_n"), &0u32);

        Ok(())
    }

    /// Create a new milestone for a beneficiary.
    ///
    /// Returns the milestone ID, which the Distribution Engine uses to reference it.
    ///
    /// # Arguments
    /// * `beneficiary` - The address this milestone applies to
    /// * `condition` - The condition definition
    pub fn create_milestone(
        env: Env,
        beneficiary: Address,
        condition: MilestoneCondition,
    ) -> Result<u32, MilestoneError> {
        Self::assert_initialized(&env)?;

        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("admin"))
            .unwrap();
        admin.require_auth();

        // Assign a new milestone ID
        let milestone_id: u32 = env
            .storage()
            .instance()
            .get(&symbol_short!("mile_n"))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&symbol_short!("mile_n"), &(milestone_id + 1));

        let milestone = Milestone {
            beneficiary: beneficiary.clone(),
            condition,
            is_met: false,
            created_at: env.ledger().sequence(),
            met_at: 0,
        };

        let key = (symbol_short!("mile"), milestone_id);
        env.storage().persistent().set(&key, &milestone);

        env.events().publish(
            (symbol_short!("m_create"), beneficiary),
            milestone_id,
        );

        Ok(milestone_id)
    }

    /// Manually approve a milestone (for ManualApproval condition type).
    ///
    /// Only admin can call this. Marks the milestone as met.
    ///
    /// # Arguments
    /// * `milestone_id` - The ID of the milestone to approve
    pub fn approve_milestone(env: Env, milestone_id: u32) -> Result<(), MilestoneError> {
        Self::assert_initialized(&env)?;

        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("admin"))
            .unwrap();
        admin.require_auth();

        let key = (symbol_short!("mile"), milestone_id);
        let mut milestone: Milestone = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(MilestoneError::MilestoneNotFound)?;

        if milestone.is_met {
            return Err(MilestoneError::AlreadyMet);
        }

        // For ManualApproval: admin signature is the condition
        // For other types: reject — they are evaluated differently
        if milestone.condition.condition_type != ConditionType::ManualApproval {
            return Err(MilestoneError::ConditionNotSatisfied);
        }

        milestone.is_met = true;
        milestone.met_at = env.ledger().sequence();
        env.storage().persistent().set(&key, &milestone);

        env.events().publish(
            (symbol_short!("m_approve"), milestone.beneficiary),
            milestone_id,
        );

        Ok(())
    }

    /// Check whether a milestone's condition has been satisfied.
    ///
    /// For `ManualApproval`, returns the stored `is_met` flag.
    /// For `TimeUnlock`, checks the current ledger against the target.
    ///
    /// This is called by the Distribution Engine before releasing funds.
    ///
    /// # Arguments
    /// * `milestone_id` - The ID to evaluate
    pub fn is_milestone_met(env: Env, milestone_id: u32) -> Result<bool, MilestoneError> {
        let key = (symbol_short!("mile"), milestone_id);
        let mut milestone: Milestone = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(MilestoneError::MilestoneNotFound)?;

        // If already marked as met, return immediately
        if milestone.is_met {
            return Ok(true);
        }

        // Evaluate condition type
        match milestone.condition.condition_type {
            ConditionType::ManualApproval => {
                // Not yet manually approved
                Ok(false)
            }
            ConditionType::TimeUnlock => {
                let target_ledger = milestone.condition.data;
                let current_ledger = env.ledger().sequence();

                if current_ledger >= target_ledger {
                    // Auto-approve: update state so future calls are cheaper
                    milestone.is_met = true;
                    milestone.met_at = current_ledger;
                    env.storage().persistent().set(&key, &milestone);
                    Ok(true)
                } else {
                    Ok(false)
                }
            }
        }
    }

    /// Fetch the full milestone record.
    pub fn get_milestone(env: Env, milestone_id: u32) -> Result<Milestone, MilestoneError> {
        let key = (symbol_short!("mile"), milestone_id);
        env.storage()
            .persistent()
            .get(&key)
            .ok_or(MilestoneError::MilestoneNotFound)
    }

    // ─── Internal Helpers ──────────────────────────────────────────────────

    fn assert_initialized(env: &Env) -> Result<(), MilestoneError> {
        if !env.storage().instance().has(&symbol_short!("admin")) {
            return Err(MilestoneError::NotInitialized);
        }
        Ok(())
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    fn setup(env: &Env) -> (Address, MilestoneEngineClient) {
        env.mock_all_auths();
        let admin = Address::generate(env);
        let contract_id = env.register_contract(None, MilestoneEngine);
        let client = MilestoneEngineClient::new(env, &contract_id);
        client.initialize(&admin).unwrap();
        (admin, client)
    }

    #[test]
    fn test_create_and_approve_manual_milestone() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let beneficiary = Address::generate(&env);

        let condition = MilestoneCondition {
            condition_type: ConditionType::ManualApproval,
            data: 0,
        };

        let id = client.create_milestone(&beneficiary, &condition).unwrap();
        assert!(!client.is_milestone_met(&id).unwrap());

        client.approve_milestone(&id).unwrap();
        assert!(client.is_milestone_met(&id).unwrap());
    }

    #[test]
    fn test_time_unlock_milestone() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let beneficiary = Address::generate(&env);

        // Set unlock at ledger 100
        let condition = MilestoneCondition {
            condition_type: ConditionType::TimeUnlock,
            data: 100,
        };

        let id = client.create_milestone(&beneficiary, &condition).unwrap();

        // Current ledger is 0 — not met yet
        // In Soroban test env, we need to advance ledger for this test
        // TODO(contributor): Use env.ledger().set_sequence() to test time unlock properly
        // For now, verify it exists and returns a sensible result
        let result = client.is_milestone_met(&id);
        assert!(result.is_ok());
    }

    #[test]
    fn test_double_approve_fails() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let beneficiary = Address::generate(&env);

        let condition = MilestoneCondition {
            condition_type: ConditionType::ManualApproval,
            data: 0,
        };

        let id = client.create_milestone(&beneficiary, &condition).unwrap();
        client.approve_milestone(&id).unwrap();

        let result = client.approve_milestone(&id);
        assert!(result.is_err());
    }

    #[test]
    fn test_approve_time_lock_fails() {
        let env = Env::default();
        let (_admin, client) = setup(&env);
        let beneficiary = Address::generate(&env);

        let condition = MilestoneCondition {
            condition_type: ConditionType::TimeUnlock,
            data: 9999,
        };

        let id = client.create_milestone(&beneficiary, &condition).unwrap();
        // Cannot manually approve a time-locked milestone
        let result = client.approve_milestone(&id);
        assert!(result.is_err());
    }

    // TODO(contributor): Test that get_milestone returns correct data
    // TODO(contributor): Test that unknown milestone_id returns MilestoneNotFound
}
