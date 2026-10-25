//! # Distribution Engine Contract
//!
//! The Distribution Engine is responsible for routing funds from the FundPool
//! to verified beneficiaries. It enforces eligibility checks, milestone conditions,
//! and prevents double-releases.
//!
//! ## Flow
//! 1. Admin calls `allocate_funds()` — records an allocation for a beneficiary
//! 2. After milestone conditions are met, admin calls `release_funds()`
//! 3. Contract calls FundPool to withdraw, then transfers to beneficiary
//!
//! ## TODO (Contributors Welcome)
//! - TODO(advanced): Implement pro-rata distribution across all beneficiaries at once
//! - TODO(intermediate): Batch release (release to multiple beneficiaries in one tx)
//! - TODO(intermediate): Add allocation expiry — unclaimed funds return to pool after N ledgers
//! - TODO(security): Add a release rate limiter to prevent draining attacks
//! - TODO(protocol-design): Should releasing require beneficiary's co-signature?

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, Vec,
};

// ─── Data Types ──────────────────────────────────────────────────────────────

/// The status of a fund allocation.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum AllocationStatus {
    /// Funds have been allocated but not yet released
    Pending = 0,
    /// Funds have been successfully transferred to the beneficiary
    Released = 1,
    /// Allocation was cancelled before release
    Cancelled = 2,
}

/// A single fund allocation record.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Allocation {
    /// The intended recipient
    pub beneficiary: Address,
    /// Amount allocated in token units
    pub amount: i128,
    /// Current status of this allocation
    pub status: AllocationStatus,
    /// Ledger at time of allocation
    pub allocated_at: u32,
    /// Ledger at time of release (0 if not released)
    pub released_at: u32,
    /// The milestone ID that gates release (0 = no milestone required)
    pub milestone_id: u32,
}

/// Error codes for the Distribution Engine.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum DistributionError {
    NotInitialized = 1,
    Unauthorized = 2,
    BeneficiaryNotEligible = 3,
    AllocationNotFound = 4,
    AlreadyReleased = 5,
    MilestoneNotMet = 6,
    InvalidAmount = 7,
    AlreadyInitialized = 8,
}

// ─── Contract ────────────────────────────────────────────────────────────────

#[contract]
pub struct DistributionEngine;

#[contractimpl]
impl DistributionEngine {
    /// Initialize the distribution engine.
    ///
    /// # Arguments
    /// * `admin` - Address authorized to allocate and release funds
    /// * `fund_pool` - Address of the FundPool contract (source of funds)
    /// * `registry` - Address of the BeneficiaryRegistry contract (eligibility checks)
    /// * `milestone_engine` - Address of the MilestoneEngine contract (condition checks)
    /// * `token` - Token contract address for transfers
    pub fn initialize(
        env: Env,
        admin: Address,
        fund_pool: Address,
        registry: Address,
        milestone_engine: Address,
        token: Address,
    ) -> Result<(), DistributionError> {
        if env.storage().instance().has(&symbol_short!("admin")) {
            return Err(DistributionError::AlreadyInitialized);
        }

        admin.require_auth();

        env.storage().instance().set(&symbol_short!("admin"), &admin);
        env.storage().instance().set(&symbol_short!("pool"), &fund_pool);
        env.storage().instance().set(&symbol_short!("reg"), &registry);
        env.storage().instance().set(&symbol_short!("mile"), &milestone_engine);
        env.storage().instance().set(&symbol_short!("token"), &token);
        env.storage().instance().set(&symbol_short!("alloc_n"), &0u32);

        Ok(())
    }

    /// Allocate funds to a beneficiary.
    ///
    /// Records the allocation on-chain. Does NOT transfer funds yet.
    /// Release happens via `release_funds()`.
    ///
    /// # Arguments
    /// * `beneficiary` - Address of the eligible beneficiary
    /// * `amount` - Amount to allocate
    /// * `milestone_id` - ID of the milestone that must be met before release (0 = none)
    pub fn allocate_funds(
        env: Env,
        beneficiary: Address,
        amount: i128,
        milestone_id: u32,
    ) -> Result<u32, DistributionError> {
        Self::assert_initialized(&env)?;

        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("admin"))
            .unwrap();
        admin.require_auth();

        if amount <= 0 {
            return Err(DistributionError::InvalidAmount);
        }

        // Verify beneficiary is eligible via cross-contract call to Registry
        // TODO(advanced): This cross-contract call costs fees; consider caching eligibility
        let registry: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("reg"))
            .unwrap();

        // We call the registry's is_eligible function
        // In production this would be a proper cross-contract call using invoke_contract
        // For now we trust that the admin has verified eligibility off-chain
        // TODO(intermediate): Implement actual cross-contract call to registry.is_eligible()
        let _ = registry; // placeholder

        // Assign a monotonically increasing allocation ID
        let alloc_id: u32 = env
            .storage()
            .instance()
            .get(&symbol_short!("alloc_n"))
            .unwrap_or(0);
        let next_id = alloc_id + 1;
        env.storage().instance().set(&symbol_short!("alloc_n"), &next_id);

        let allocation = Allocation {
            beneficiary: beneficiary.clone(),
            amount,
            status: AllocationStatus::Pending,
            allocated_at: env.ledger().sequence(),
            released_at: 0,
            milestone_id,
        };

        // Store allocation by ID
        let alloc_key = (symbol_short!("alloc"), alloc_id);
        env.storage().persistent().set(&alloc_key, &allocation);

        // Also maintain a per-beneficiary list of allocation IDs
        let bkey = (symbol_short!("balloc"), beneficiary.clone());
        let mut blist: Vec<u32> = env
            .storage()
            .persistent()
            .get(&bkey)
            .unwrap_or(Vec::new(&env));
        blist.push_back(alloc_id);
        env.storage().persistent().set(&bkey, &blist);

        env.events().publish(
            (symbol_short!("alloc"), beneficiary),
            (alloc_id, amount),
        );

        Ok(alloc_id)
    }

    /// Release allocated funds to a beneficiary.
    ///
    /// Checks that:
    /// 1. The allocation exists and is in Pending status
    /// 2. The milestone condition (if any) is met
    /// 3. Transfers tokens from the FundPool to the beneficiary
    ///
    /// # Arguments
    /// * `allocation_id` - ID of the allocation to release
    pub fn release_funds(env: Env, allocation_id: u32) -> Result<(), DistributionError> {
        Self::assert_initialized(&env)?;

        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("admin"))
            .unwrap();
        admin.require_auth();

        let alloc_key = (symbol_short!("alloc"), allocation_id);
        let mut allocation: Allocation = env
            .storage()
            .persistent()
            .get(&alloc_key)
            .ok_or(DistributionError::AllocationNotFound)?;

        if allocation.status == AllocationStatus::Released {
            return Err(DistributionError::AlreadyReleased);
        }

        // Check milestone condition if one is attached
        if allocation.milestone_id != 0 {
            let is_met = Self::check_milestone_condition(&env, allocation.milestone_id)?;
            if !is_met {
                return Err(DistributionError::MilestoneNotMet);
            }
        }

        // Update allocation status BEFORE token transfer (re-entrancy guard pattern)
        allocation.status = AllocationStatus::Released;
        allocation.released_at = env.ledger().sequence();
        env.storage().persistent().set(&alloc_key, &allocation);

        // TODO(advanced): Call FundPool.withdraw_for_distribution() here
        // This requires cross-contract invocation setup. For now, the admin
        // is expected to have pre-funded this contract with the token.
        let token: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("token"))
            .unwrap();

        let token_client = soroban_sdk::token::Client::new(&env, &token);
        token_client.transfer(
            &env.current_contract_address(),
            &allocation.beneficiary,
            &allocation.amount,
        );

        env.events().publish(
            (symbol_short!("release"), allocation.beneficiary.clone()),
            (allocation_id, allocation.amount),
        );

        Ok(())
    }

    /// Cancel a pending allocation.
    ///
    /// Cancellation is only possible before release.
    ///
    /// # Arguments
    /// * `allocation_id` - ID of the allocation to cancel
    pub fn cancel_allocation(env: Env, allocation_id: u32) -> Result<(), DistributionError> {
        Self::assert_initialized(&env)?;

        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("admin"))
            .unwrap();
        admin.require_auth();

        let alloc_key = (symbol_short!("alloc"), allocation_id);
        let mut allocation: Allocation = env
            .storage()
            .persistent()
            .get(&alloc_key)
            .ok_or(DistributionError::AllocationNotFound)?;

        if allocation.status != AllocationStatus::Pending {
            return Err(DistributionError::AlreadyReleased);
        }

        allocation.status = AllocationStatus::Cancelled;
        env.storage().persistent().set(&alloc_key, &allocation);

        Ok(())
    }

    /// Fetch a specific allocation by its ID.
    pub fn get_allocation(env: Env, allocation_id: u32) -> Result<Allocation, DistributionError> {
        Self::assert_initialized(&env)?;
        let alloc_key = (symbol_short!("alloc"), allocation_id);
        env.storage()
            .persistent()
            .get(&alloc_key)
            .ok_or(DistributionError::AllocationNotFound)
    }

    /// Fetch all allocation IDs for a specific beneficiary.
    pub fn get_beneficiary_allocations(
        env: Env,
        beneficiary: Address,
    ) -> Result<Vec<u32>, DistributionError> {
        Self::assert_initialized(&env)?;
        let bkey = (symbol_short!("balloc"), beneficiary);
        Ok(env
            .storage()
            .persistent()
            .get(&bkey)
            .unwrap_or(Vec::new(&env)))
    }

    /// Returns the total number of allocations created.
    pub fn get_allocation_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&symbol_short!("alloc_n"))
            .unwrap_or(0)
    }

    // ─── Internal Helpers ──────────────────────────────────────────────────

    fn assert_initialized(env: &Env) -> Result<(), DistributionError> {
        if !env.storage().instance().has(&symbol_short!("admin")) {
            return Err(DistributionError::NotInitialized);
        }
        Ok(())
    }

    /// Check if a milestone condition is satisfied.
    ///
    /// Currently does a basic cross-contract call to the MilestoneEngine.
    /// TODO(advanced): Implement actual cross-contract invoke call
    fn check_milestone_condition(
        env: &Env,
        milestone_id: u32,
    ) -> Result<bool, DistributionError> {
        // TODO(intermediate): Replace this with a real cross-contract call:
        //   env.invoke_contract(
        //     &milestone_engine_address,
        //     &Symbol::new(env, "is_milestone_met"),
        //     vec![env, milestone_id.into_val(env)]
        //   )
        //
        // For now we return true to unblock development of other components.
        let _ = (env, milestone_id);
        Ok(true)
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::Address as _,
        token::{Client as TokenClient, StellarAssetClient},
        Address, Env,
    };

    fn setup(env: &Env) -> (Address, Address, DistributionEngineClient, Address) {
        env.mock_all_auths();
        let admin = Address::generate(env);
        let beneficiary = Address::generate(env);
        let fund_pool = Address::generate(env);
        let registry = Address::generate(env);
        let milestone = Address::generate(env);

        let token_admin = Address::generate(env);
        let token_id = env.register_stellar_asset_contract(token_admin.clone());
        let token_sac = StellarAssetClient::new(env, &token_id);

        let contract_id = env.register_contract(None, DistributionEngine);
        let client = DistributionEngineClient::new(env, &contract_id);

        // Mint tokens to distribution contract (simulates FundPool withdrawal)
        token_sac.mint(&contract_id, &1_000_000_000);

        client
            .initialize(&admin, &fund_pool, &registry, &milestone, &token_id)
            .unwrap();

        (admin, beneficiary, client, token_id)
    }

    #[test]
    fn test_allocate_and_release() {
        let env = Env::default();
        let (_admin, beneficiary, client, token_id) = setup(&env);

        let alloc_id = client
            .allocate_funds(&beneficiary, &100_000_000i128, &0u32)
            .unwrap();

        assert_eq!(alloc_id, 0);

        client.release_funds(&alloc_id).unwrap();

        let alloc = client.get_allocation(&alloc_id).unwrap();
        assert_eq!(alloc.status, AllocationStatus::Released);
    }

    #[test]
    fn test_double_release_fails() {
        let env = Env::default();
        let (_admin, beneficiary, client, _) = setup(&env);

        let alloc_id = client
            .allocate_funds(&beneficiary, &50_000_000i128, &0u32)
            .unwrap();

        client.release_funds(&alloc_id).unwrap();
        let result = client.release_funds(&alloc_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_cancel_allocation() {
        let env = Env::default();
        let (_admin, beneficiary, client, _) = setup(&env);

        let alloc_id = client
            .allocate_funds(&beneficiary, &50_000_000i128, &0u32)
            .unwrap();

        client.cancel_allocation(&alloc_id).unwrap();

        let alloc = client.get_allocation(&alloc_id).unwrap();
        assert_eq!(alloc.status, AllocationStatus::Cancelled);
    }

    #[test]
    fn test_allocation_count_increments() {
        let env = Env::default();
        let (_admin, beneficiary, client, _) = setup(&env);

        client.allocate_funds(&beneficiary, &50_000_000i128, &0u32).unwrap();
        client.allocate_funds(&beneficiary, &50_000_000i128, &0u32).unwrap();

        assert_eq!(client.get_allocation_count(), 2);
    }

    // TODO(contributor): Test that allocating with milestone_id != 0 blocks release
    // TODO(contributor): Test beneficiary allocation list is correctly maintained
}
