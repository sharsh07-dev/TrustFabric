//! # Beneficiary Registry Contract
//!
//! The BeneficiaryRegistry is the source of truth for who is eligible to receive funds.
//! It stores recipient metadata and tracks verification status.
//!
//! ## Design Notes
//! - Metadata is stored on-chain as a structured type (not IPFS CID yet — see TODOs)
//! - Verification is currently a simple boolean flag set by an admin
//! - The registry is append-only: beneficiaries can be deactivated but not deleted
//!
//! ## TODO (Contributors Welcome)
//! - TODO(advanced): Replace simple admin verification with multi-sig approval
//! - TODO(advanced): Store metadata hash on-chain, full metadata on IPFS for privacy
//! - TODO(intermediate): Add beneficiary categories (food_security, medical, shelter, etc.)
//! - TODO(intermediate): Implement pagination for list_beneficiaries()
//! - TODO(security): Add duplicate address detection
//! - TODO(protocol-design): Define what "verified" means — integrate with Stellar KYC anchors?

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Bytes, Env, Vec,
};

// ─── Data Types ──────────────────────────────────────────────────────────────

/// Metadata stored for each beneficiary.
///
/// Currently minimal to keep the contract simple.
/// See TODO above for planned metadata enhancements.
#[contracttype]
#[derive(Clone, Debug)]
pub struct BeneficiaryMetadata {
    /// Human-readable name (stored on-chain for transparency)
    /// TODO(privacy): Consider storing only a hash here and keeping name off-chain
    pub name: Bytes,
    /// Geographic region identifier (e.g., b"northern_nigeria")
    pub region: Bytes,
    /// Aid category this beneficiary qualifies for
    pub category: Bytes,
}

/// Full beneficiary record stored in the registry.
#[contracttype]
#[derive(Clone, Debug)]
pub struct BeneficiaryRecord {
    /// Stellar address of the beneficiary
    pub address: Address,
    /// Associated metadata
    pub metadata: BeneficiaryMetadata,
    /// Whether this beneficiary has been verified by an admin
    pub is_verified: bool,
    /// Whether this beneficiary is currently active (can receive funds)
    pub is_active: bool,
    /// Ledger sequence at time of registration
    pub registered_at: u32,
}

/// Error codes for the BeneficiaryRegistry contract.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum RegistryError {
    NotInitialized = 1,
    Unauthorized = 2,
    BeneficiaryNotFound = 3,
    AlreadyRegistered = 4,
    AlreadyInitialized = 5,
    BeneficiaryNotVerified = 6,
}

// ─── Contract ────────────────────────────────────────────────────────────────

#[contract]
pub struct BeneficiaryRegistry;

#[contractimpl]
impl BeneficiaryRegistry {
    /// Initialize the registry with an admin address.
    ///
    /// # Arguments
    /// * `admin` - Address authorized to verify and manage beneficiaries
    pub fn initialize(env: Env, admin: Address) -> Result<(), RegistryError> {
        if env.storage().instance().has(&symbol_short!("admin")) {
            return Err(RegistryError::AlreadyInitialized);
        }

        admin.require_auth();
        env.storage().instance().set(&symbol_short!("admin"), &admin);

        // Initialize empty beneficiary list
        let empty: Vec<Address> = Vec::new(&env);
        env.storage().instance().set(&symbol_short!("blist"), &empty);

        Ok(())
    }

    /// Register a new beneficiary in the registry.
    ///
    /// The beneficiary is registered but NOT yet verified. An admin must call
    /// `verify_beneficiary()` separately before funds can flow to this address.
    ///
    /// # Arguments
    /// * `address` - Stellar address of the beneficiary
    /// * `metadata` - Descriptive information about the beneficiary
    pub fn register_beneficiary(
        env: Env,
        address: Address,
        metadata: BeneficiaryMetadata,
    ) -> Result<(), RegistryError> {
        Self::assert_initialized(&env)?;

        // Only admin can register beneficiaries.
        // TODO(protocol-design): Should beneficiaries be able to self-register?
        // Self-registration would require a different verification flow.
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("admin"))
            .unwrap();
        admin.require_auth();

        // Check for duplicate registration
        let record_key = (symbol_short!("brec"), address.clone());
        if env.storage().persistent().has(&record_key) {
            return Err(RegistryError::AlreadyRegistered);
        }

        // Create the beneficiary record
        let record = BeneficiaryRecord {
            address: address.clone(),
            metadata,
            is_verified: false, // Must be explicitly verified
            is_active: true,
            registered_at: env.ledger().sequence(),
        };

        // Store the record
        env.storage().persistent().set(&record_key, &record);

        // Add to the global address list
        // TODO(performance): This unbounded list will hit limits at scale — implement pagination
        let mut list: Vec<Address> = env
            .storage()
            .instance()
            .get(&symbol_short!("blist"))
            .unwrap_or(Vec::new(&env));
        list.push_back(address.clone());
        env.storage().instance().set(&symbol_short!("blist"), &list);

        env.events().publish(
            (symbol_short!("reg"), address),
            env.ledger().sequence(),
        );

        Ok(())
    }

    /// Mark a beneficiary as verified.
    ///
    /// Only admin can verify. Verified beneficiaries can receive fund allocations.
    ///
    /// # Arguments
    /// * `address` - The address to verify
    pub fn verify_beneficiary(env: Env, address: Address) -> Result<(), RegistryError> {
        Self::assert_initialized(&env)?;

        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("admin"))
            .unwrap();
        admin.require_auth();

        let record_key = (symbol_short!("brec"), address.clone());
        let mut record: BeneficiaryRecord = env
            .storage()
            .persistent()
            .get(&record_key)
            .ok_or(RegistryError::BeneficiaryNotFound)?;

        record.is_verified = true;
        env.storage().persistent().set(&record_key, &record);

        env.events().publish(
            (symbol_short!("verify"), address),
            env.ledger().sequence(),
        );

        Ok(())
    }

    /// Deactivate a beneficiary (e.g., if fraud is detected or aid period ends).
    ///
    /// The record is preserved for audit purposes but the beneficiary can no longer
    /// receive new fund releases.
    ///
    /// TODO(security): Add an audit log entry when deactivating a beneficiary
    ///
    /// # Arguments
    /// * `address` - The address to deactivate
    pub fn deactivate_beneficiary(env: Env, address: Address) -> Result<(), RegistryError> {
        Self::assert_initialized(&env)?;

        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("admin"))
            .unwrap();
        admin.require_auth();

        let record_key = (symbol_short!("brec"), address.clone());
        let mut record: BeneficiaryRecord = env
            .storage()
            .persistent()
            .get(&record_key)
            .ok_or(RegistryError::BeneficiaryNotFound)?;

        record.is_active = false;
        env.storage().persistent().set(&record_key, &record);

        Ok(())
    }

    /// Fetch a beneficiary's full record.
    ///
    /// # Arguments
    /// * `address` - The beneficiary's address
    pub fn get_beneficiary(
        env: Env,
        address: Address,
    ) -> Result<BeneficiaryRecord, RegistryError> {
        Self::assert_initialized(&env)?;
        let record_key = (symbol_short!("brec"), address);
        env.storage()
            .persistent()
            .get(&record_key)
            .ok_or(RegistryError::BeneficiaryNotFound)
    }

    /// Returns the list of all registered beneficiary addresses.
    ///
    /// Note: Does not paginate. At large scale this will need redesign.
    /// TODO(intermediate): Implement cursor-based pagination
    pub fn list_beneficiaries(env: Env) -> Result<Vec<Address>, RegistryError> {
        Self::assert_initialized(&env)?;
        Ok(env
            .storage()
            .instance()
            .get(&symbol_short!("blist"))
            .unwrap_or(Vec::new(&env)))
    }

    /// Check if an address is a verified, active beneficiary.
    /// Used by the Distribution Engine before releasing funds.
    ///
    /// # Arguments
    /// * `address` - Address to check
    pub fn is_eligible(env: Env, address: Address) -> bool {
        let record_key = (symbol_short!("brec"), address);
        if let Some(record) = env
            .storage()
            .persistent()
            .get::<_, BeneficiaryRecord>(&record_key)
        {
            record.is_verified && record.is_active
        } else {
            false
        }
    }

    // ─── Internal Helpers ──────────────────────────────────────────────────

    fn assert_initialized(env: &Env) -> Result<(), RegistryError> {
        if !env.storage().instance().has(&symbol_short!("admin")) {
            return Err(RegistryError::NotInitialized);
        }
        Ok(())
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Bytes, Env};

    fn make_metadata(env: &Env) -> BeneficiaryMetadata {
        BeneficiaryMetadata {
            name: Bytes::from_slice(env, b"Amina Hassan"),
            region: Bytes::from_slice(env, b"Kano"),
            category: Bytes::from_slice(env, b"food_security"),
        }
    }

    fn setup(env: &Env) -> (Address, Address, BeneficiaryRegistryClient) {
        env.mock_all_auths();
        let admin = Address::generate(env);
        let contract_id = env.register_contract(None, BeneficiaryRegistry);
        let client = BeneficiaryRegistryClient::new(env, &contract_id);
        client.initialize(&admin).unwrap();
        let beneficiary = Address::generate(env);
        (admin, beneficiary, client)
    }

    #[test]
    fn test_register_and_get_beneficiary() {
        let env = Env::default();
        let (_admin, beneficiary, client) = setup(&env);
        let meta = make_metadata(&env);

        client.register_beneficiary(&beneficiary, &meta).unwrap();

        let record = client.get_beneficiary(&beneficiary).unwrap();
        assert_eq!(record.address, beneficiary);
        assert!(!record.is_verified);
        assert!(record.is_active);
    }

    #[test]
    fn test_verify_beneficiary() {
        let env = Env::default();
        let (_admin, beneficiary, client) = setup(&env);
        let meta = make_metadata(&env);

        client.register_beneficiary(&beneficiary, &meta).unwrap();
        client.verify_beneficiary(&beneficiary).unwrap();

        let record = client.get_beneficiary(&beneficiary).unwrap();
        assert!(record.is_verified);
        assert!(client.is_eligible(&beneficiary));
    }

    #[test]
    fn test_unverified_not_eligible() {
        let env = Env::default();
        let (_admin, beneficiary, client) = setup(&env);
        let meta = make_metadata(&env);

        client.register_beneficiary(&beneficiary, &meta).unwrap();
        // Not verified yet
        assert!(!client.is_eligible(&beneficiary));
    }

    #[test]
    fn test_deactivate_removes_eligibility() {
        let env = Env::default();
        let (_admin, beneficiary, client) = setup(&env);
        let meta = make_metadata(&env);

        client.register_beneficiary(&beneficiary, &meta).unwrap();
        client.verify_beneficiary(&beneficiary).unwrap();
        assert!(client.is_eligible(&beneficiary));

        client.deactivate_beneficiary(&beneficiary).unwrap();
        assert!(!client.is_eligible(&beneficiary));
    }

    #[test]
    fn test_duplicate_registration_fails() {
        let env = Env::default();
        let (_admin, beneficiary, client) = setup(&env);
        let meta = make_metadata(&env);

        client.register_beneficiary(&beneficiary, &meta.clone()).unwrap();
        let result = client.register_beneficiary(&beneficiary, &meta);
        assert!(result.is_err());
    }

    #[test]
    fn test_list_beneficiaries() {
        let env = Env::default();
        let (_admin, b1, client) = setup(&env);
        env.mock_all_auths();
        let b2 = Address::generate(&env);
        let meta = make_metadata(&env);

        client.register_beneficiary(&b1, &meta.clone()).unwrap();
        client.register_beneficiary(&b2, &meta).unwrap();

        let list = client.list_beneficiaries().unwrap();
        assert_eq!(list.len(), 2);
    }

    // TODO(contributor): Test that non-admin cannot register beneficiaries
    // TODO(contributor): Test get_beneficiary for unknown address returns error
}
