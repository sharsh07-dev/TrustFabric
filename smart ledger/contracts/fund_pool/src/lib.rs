//! # FundPool Contract
//!
//! The FundPool contract is the entry point for all donor contributions.
//! It holds deposited funds and tracks donation history per donor.
//!
//! ## Responsibilities
//! - Accept donations from verified donors
//! - Track total funds available for distribution
//! - Maintain a per-donor ledger for transparency
//! - Authorize withdrawals to the Distribution Engine only
//!
//! ## TODO (Contributors Welcome)
//! - TODO(intermediate): Add support for multi-token donations (not just one token)
//! - TODO(intermediate): Implement donation caps per donor per campaign
//! - TODO(advanced): Add recurring donation logic (time-based deposits)
//! - TODO(protocol-design): Define governance for changing the admin address

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    token, Address, Env, Vec,
};

// ─── Storage Keys ────────────────────────────────────────────────────────────

/// Key for storing the contract administrator address
const ADMIN_KEY: &str = "admin";

/// Key for storing the accepted token contract address
const TOKEN_KEY: &str = "token";

/// Key for storing the distribution contract address (the only authorized withdrawer)
const DISTRIBUTOR_KEY: &str = "distributor";

/// Key for tracking total funds deposited (not yet released)
const TOTAL_FUNDS_KEY: &str = "total_funds";

// ─── Data Types ──────────────────────────────────────────────────────────────

/// Represents a single donation event, stored in the donor's history ledger.
#[contracttype]
#[derive(Clone, Debug)]
pub struct DonationRecord {
    /// The donor's Stellar address
    pub donor: Address,
    /// Amount donated in the smallest token unit (e.g., stroops for XLM)
    pub amount: i128,
    /// Ledger sequence number at time of donation (used as a timestamp proxy)
    pub ledger: u32,
}

/// Error codes for the FundPool contract.
/// We use explicit error codes so callers can handle specific failures.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum FundPoolError {
    /// Contract has not been initialized
    NotInitialized = 1,
    /// Caller is not authorized to perform this action
    Unauthorized = 2,
    /// Donation amount must be greater than zero
    InvalidAmount = 3,
    /// Requested withdrawal exceeds available funds
    InsufficientFunds = 4,
    /// Contract has already been initialized
    AlreadyInitialized = 5,
}

// ─── Contract ────────────────────────────────────────────────────────────────

#[contract]
pub struct FundPoolContract;

#[contractimpl]
impl FundPoolContract {
    /// Initialize the contract with an admin, accepted token, and distribution contract.
    ///
    /// This must be called once after deployment. Subsequent calls will fail.
    ///
    /// # Arguments
    /// * `admin` - Address that can update configuration
    /// * `token` - The token contract address for accepted donations
    /// * `distributor` - The Distribution Engine contract, the only allowed withdrawer
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        distributor: Address,
    ) -> Result<(), FundPoolError> {
        // Prevent re-initialization
        if env.storage().instance().has(&symbol_short!("admin")) {
            return Err(FundPoolError::AlreadyInitialized);
        }

        admin.require_auth();

        env.storage().instance().set(&symbol_short!("admin"), &admin);
        env.storage().instance().set(&symbol_short!("token"), &token);
        env.storage().instance().set(&symbol_short!("distr"), &distributor);
        env.storage().instance().set(&symbol_short!("total"), &0i128);

        Ok(())
    }

    /// Accept a donation from a donor.
    ///
    /// Transfers `amount` tokens from the donor's account into this contract.
    /// Records the donation in the donor's on-chain history.
    ///
    /// # Arguments
    /// * `donor` - Address making the donation (must authorize)
    /// * `amount` - Token amount to donate (must be > 0)
    pub fn donate(env: Env, donor: Address, amount: i128) -> Result<(), FundPoolError> {
        // Validate initialization
        Self::assert_initialized(&env)?;

        // The donor must sign this transaction
        donor.require_auth();

        if amount <= 0 {
            return Err(FundPoolError::InvalidAmount);
        }

        let token_address: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("token"))
            .unwrap();

        let token_client = token::Client::new(&env, &token_address);

        // Transfer tokens from donor to this contract
        token_client.transfer(&donor, &env.current_contract_address(), &amount);

        // Update total funds
        let current_total: i128 = env
            .storage()
            .instance()
            .get(&symbol_short!("total"))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&symbol_short!("total"), &(current_total + amount));

        // Record donation in donor's personal history
        // The history is stored as a Vec per donor address
        let history_key = (symbol_short!("dh"), donor.clone());
        let mut history: Vec<DonationRecord> = env
            .storage()
            .persistent()
            .get(&history_key)
            .unwrap_or(Vec::new(&env));

        history.push_back(DonationRecord {
            donor: donor.clone(),
            amount,
            ledger: env.ledger().sequence(),
        });

        env.storage().persistent().set(&history_key, &history);

        // Emit an event so off-chain indexers can track donations
        // TODO(intermediate): Define a structured event type for better indexing
        env.events().publish(
            (symbol_short!("donate"), donor),
            amount,
        );

        Ok(())
    }

    /// Withdraw funds to the distribution contract.
    ///
    /// Only the registered Distribution Engine contract may call this.
    /// This enforces that funds can only flow through the approved distribution pathway.
    ///
    /// # Arguments
    /// * `amount` - Amount to withdraw for distribution
    pub fn withdraw_for_distribution(env: Env, amount: i128) -> Result<(), FundPoolError> {
        Self::assert_initialized(&env)?;

        // Only the distribution contract may withdraw
        let distributor: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("distr"))
            .unwrap();
        distributor.require_auth();

        let current_total: i128 = env
            .storage()
            .instance()
            .get(&symbol_short!("total"))
            .unwrap_or(0);

        if amount > current_total {
            return Err(FundPoolError::InsufficientFunds);
        }

        let token_address: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("token"))
            .unwrap();

        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &distributor, &amount);

        // Deduct from total
        env.storage()
            .instance()
            .set(&symbol_short!("total"), &(current_total - amount));

        Ok(())
    }

    /// Returns the total amount of funds currently held in the pool.
    pub fn get_total_funds(env: Env) -> Result<i128, FundPoolError> {
        Self::assert_initialized(&env)?;
        Ok(env
            .storage()
            .instance()
            .get(&symbol_short!("total"))
            .unwrap_or(0))
    }

    /// Returns the donation history for a specific donor address.
    ///
    /// # Arguments
    /// * `donor` - The donor's address to query
    pub fn get_donor_history(env: Env, donor: Address) -> Result<Vec<DonationRecord>, FundPoolError> {
        Self::assert_initialized(&env)?;
        let history_key = (symbol_short!("dh"), donor);
        Ok(env
            .storage()
            .persistent()
            .get(&history_key)
            .unwrap_or(Vec::new(&env)))
    }

    /// Returns the current admin address.
    pub fn get_admin(env: Env) -> Result<Address, FundPoolError> {
        Self::assert_initialized(&env)?;
        Ok(env
            .storage()
            .instance()
            .get(&symbol_short!("admin"))
            .unwrap())
    }

    // ─── Internal Helpers ──────────────────────────────────────────────────

    /// Checks that the contract has been initialized. Returns an error if not.
    fn assert_initialized(env: &Env) -> Result<(), FundPoolError> {
        if !env.storage().instance().has(&symbol_short!("admin")) {
            return Err(FundPoolError::NotInitialized);
        }
        Ok(())
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation},
        token::{Client as TokenClient, StellarAssetClient},
        Address, Env, IntoVal,
    };

    /// Helper: set up a test environment with a token and fund pool contract
    fn setup() -> (Env, Address, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let donor = Address::generate(&env);

        // Deploy a test token (Stellar Asset Contract)
        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(token_admin.clone());
        let token_sac = StellarAssetClient::new(&env, &token_id);

        // Mint tokens to donor
        token_sac.mint(&donor, &1_000_000_000);

        let distributor = Address::generate(&env);

        // Deploy FundPool contract
        let fund_pool_id = env.register_contract(None, FundPoolContract);
        let fund_pool = FundPoolContractClient::new(&env, &fund_pool_id);

        // Initialize
        fund_pool
            .initialize(&admin, &token_id, &distributor)
            .unwrap();

        (env, fund_pool_id, token_id, donor, distributor)
    }

    #[test]
    fn test_initialize() {
        let (env, fund_pool_id, _token_id, _donor, _distributor) = setup();
        let fund_pool = FundPoolContractClient::new(&env, &fund_pool_id);
        // Should not error
        assert!(fund_pool.get_total_funds().is_ok());
    }

    #[test]
    fn test_donate_increases_total() {
        let (env, fund_pool_id, _token_id, donor, _distributor) = setup();
        let fund_pool = FundPoolContractClient::new(&env, &fund_pool_id);

        let amount: i128 = 500_000_000;
        fund_pool.donate(&donor, &amount).unwrap();

        let total = fund_pool.get_total_funds().unwrap();
        assert_eq!(total, amount);
    }

    #[test]
    fn test_donate_records_history() {
        let (env, fund_pool_id, _token_id, donor, _distributor) = setup();
        let fund_pool = FundPoolContractClient::new(&env, &fund_pool_id);

        fund_pool.donate(&donor, &100_000_000).unwrap();
        fund_pool.donate(&donor, &200_000_000).unwrap();

        let history = fund_pool.get_donor_history(&donor).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history.get(0).unwrap().amount, 100_000_000);
        assert_eq!(history.get(1).unwrap().amount, 200_000_000);
    }

    #[test]
    fn test_donate_zero_fails() {
        let (env, fund_pool_id, _token_id, donor, _distributor) = setup();
        let fund_pool = FundPoolContractClient::new(&env, &fund_pool_id);

        let result = fund_pool.donate(&donor, &0);
        assert!(result.is_err());
    }

    #[test]
    fn test_double_initialize_fails() {
        let (env, fund_pool_id, token_id, _donor, distributor) = setup();
        let fund_pool = FundPoolContractClient::new(&env, &fund_pool_id);
        let admin2 = Address::generate(&env);

        // Second initialization should fail
        let result = fund_pool.initialize(&admin2, &token_id, &distributor);
        assert!(result.is_err());
    }

    // TODO(contributor): Add test for unauthorized withdrawal
    // TODO(contributor): Add test for withdrawal exceeding total funds
    // TODO(contributor): Add test that verifies token transfer actually moves funds
}
