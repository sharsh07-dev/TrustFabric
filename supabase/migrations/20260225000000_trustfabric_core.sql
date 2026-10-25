-- =============================================================================
-- TrustFabric Protocol Core Database Schema Migration
-- CASCADE '26 Theme 4 Problem 4.2: "The Black Hole Ledger: Verifiable NGO Fund Flows"
-- Compliant with TRD Section 4 & Master Build Prompt
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Organizations & User Profiles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    legal_identifier VARCHAR(100) NOT NULL UNIQUE,
    country VARCHAR(3) NOT NULL DEFAULT 'IND',
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'UNDER_AUDIT')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID UNIQUE,
    organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('DONOR', 'FINANCE_ADMIN', 'FIELD_OFFICER', 'AUDITOR', 'SYSTEM_AGENT')),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. Donors & Grants
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    display_name VARCHAR(255) NOT NULL,
    organization_ref VARCHAR(255),
    wallet_address VARCHAR(100),
    access_scope VARCHAR(50) NOT NULL DEFAULT 'GRANT_RESTRICTED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    grant_code VARCHAR(100) NOT NULL UNIQUE,
    donor_id UUID REFERENCES donors(id) ON DELETE RESTRICT,
    organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    purpose TEXT NOT NULL,
    currency VARCHAR(10) NOT NULL CHECK (currency IN ('INR', 'USD', 'EUR', 'ETH', 'USDC')),
    authorized_amount_minor BIGINT NOT NULL CHECK (authorized_amount_minor > 0),
    allocated_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (allocated_amount_minor >= 0),
    disbursed_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (disbursed_amount_minor >= 0),
    held_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (held_amount_minor >= 0),
    allowed_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED', 'FROZEN')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_allocated_within_authorized CHECK (allocated_amount_minor <= authorized_amount_minor),
    CONSTRAINT chk_disbursed_within_allocated CHECK (disbursed_amount_minor <= allocated_amount_minor)
);

CREATE TABLE IF NOT EXISTS allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    grant_id UUID NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency VARCHAR(10) NOT NULL,
    milestone_id VARCHAR(100) NOT NULL,
    condition_hash VARCHAR(66),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DEPLETED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3. Financial Events & Lineage Graph
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financial_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    grant_id UUID REFERENCES grants(id) ON DELETE RESTRICT,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('DONATION_DEPOSIT', 'TOKEN_SWAP', 'BRIDGE_TRANSFER', 'FIAT_SETTLEMENT', 'VENDOR_DISBURSEMENT', 'BANK_FEE')),
    source_network VARCHAR(50) NOT NULL, -- 'ETHEREUM_SEPOLIA', 'POLYGON_POS', 'RBI_NEFT'
    tx_hash VARCHAR(120) NOT NULL,
    block_number BIGINT,
    block_hash VARCHAR(120),
    source_account_ref VARCHAR(120) NOT NULL,
    destination_ref VARCHAR(120) NOT NULL,
    asset_id VARCHAR(50) NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency VARCHAR(10) NOT NULL,
    exchange_rate NUMERIC(18, 6) DEFAULT 1.0,
    fee_minor BIGINT DEFAULT 0,
    occurred_at TIMESTAMPTZ NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verification_status VARCHAR(50) NOT NULL DEFAULT 'SOURCE_ATTESTED' CHECK (verification_status IN ('ON_CHAIN_VERIFIED', 'SOURCE_ATTESTED', 'UNVERIFIED', 'SIMULATED')),
    idempotency_key VARCHAR(150) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS flow_edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_event_id UUID NOT NULL REFERENCES financial_events(id) ON DELETE RESTRICT,
    to_event_id UUID NOT NULL REFERENCES financial_events(id) ON DELETE RESTRICT,
    edge_type VARCHAR(50) NOT NULL CHECK (edge_type IN ('TRANSFER', 'SWAP', 'BRIDGE', 'OFFRAMP', 'PAYMENT', 'ALLOCATION')),
    amount_in_minor BIGINT NOT NULL,
    asset_in VARCHAR(20) NOT NULL,
    amount_out_minor BIGINT NOT NULL,
    asset_out VARCHAR(20) NOT NULL,
    fee_minor BIGINT DEFAULT 0,
    rate NUMERIC(18, 6) DEFAULT 1.0,
    confidence_reason TEXT NOT NULL,
    link_status VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED' CHECK (link_status IN ('CONFIRMED', 'DISPUTED', 'SIMULATED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 4. Claims, Evidence & Privacy Nullifiers
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expense_claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    grant_id UUID NOT NULL REFERENCES grants(id) ON DELETE RESTRICT,
    vendor_ref VARCHAR(255) NOT NULL,
    invoice_number_token VARCHAR(100) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    invoice_date DATE NOT NULL,
    category VARCHAR(100) NOT NULL,
    purpose_ref TEXT NOT NULL,
    payment_event_id UUID REFERENCES financial_events(id),
    delivery_milestone_id VARCHAR(100),
    claim_status VARCHAR(50) NOT NULL DEFAULT 'SUBMITTED' CHECK (claim_status IN ('SUBMITTED', 'VERIFIED', 'REJECTED')),
    disbursement_status VARCHAR(50) NOT NULL DEFAULT 'LOCKED' CHECK (disbursement_status IN ('LOCKED', 'CONDITION_PENDING', 'RELEASE_ELIGIBLE', 'ON_HOLD', 'RELEASED', 'REJECTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Atomic Expense Nullifier Registry (PS42-R16 & PS42-R17)
CREATE TABLE IF NOT EXISTS expense_nullifiers (
    nullifier_hash VARCHAR(66) PRIMARY KEY,
    claim_id UUID NOT NULL REFERENCES expense_claims(id) ON DELETE RESTRICT,
    grant_id UUID NOT NULL REFERENCES grants(id) ON DELETE RESTRICT,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_id UUID NOT NULL REFERENCES expense_claims(id) ON DELETE CASCADE,
    storage_key VARCHAR(500) NOT NULL UNIQUE,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256 VARCHAR(64) NOT NULL,
    expense_nullifier VARCHAR(66) REFERENCES expense_nullifiers(nullifier_hash),
    extracted_fields_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ocr_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (ocr_status IN ('PENDING', 'EXTRACTED', 'FALLBACK_MANUAL', 'FAILED')),
    verification_status VARCHAR(50) NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('VERIFIED', 'DISPUTED_DUPLICATE', 'UNVERIFIED')),
    uploaded_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_attestations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    claim_id UUID NOT NULL REFERENCES expense_claims(id) ON DELETE CASCADE,
    milestone_id VARCHAR(100) NOT NULL,
    canonical_commitment VARCHAR(66) NOT NULL,
    signer_public_key VARCHAR(128) NOT NULL,
    signature VARCHAR(256) NOT NULL,
    nonce VARCHAR(66) NOT NULL UNIQUE,
    issued_at TIMESTAMPTZ NOT NULL,
    verification_status VARCHAR(50) NOT NULL DEFAULT 'SOURCE_ATTESTED' CHECK (verification_status IN ('SOURCE_ATTESTED', 'INVALID_SIGNATURE', 'REPLAYED'))
);

-- -----------------------------------------------------------------------------
-- 5. Discrepancy Findings & Escrow State Machine
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verification_findings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    grant_id UUID NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
    claim_id UUID REFERENCES expense_claims(id) ON DELETE SET NULL,
    type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'WARNING', 'INFO')),
    rule_id VARCHAR(50) NOT NULL,
    explanation TEXT NOT NULL,
    affected_amount_minor BIGINT NOT NULL DEFAULT 0,
    evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    action_taken TEXT NOT NULL,
    finding_status VARCHAR(50) NOT NULL DEFAULT 'OPEN' CHECK (finding_status IN ('OPEN', 'INVESTIGATING', 'CONFIRMED', 'DISPUTED', 'RESOLVED')),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS escrow_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    grant_id UUID NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
    claim_id UUID NOT NULL REFERENCES expense_claims(id) ON DELETE CASCADE,
    tranche_id VARCHAR(100) NOT NULL UNIQUE,
    state VARCHAR(50) NOT NULL DEFAULT 'LOCKED' CHECK (state IN ('LOCKED', 'CONDITION_PENDING', 'RELEASE_ELIGIBLE', 'ON_HOLD', 'RELEASED', 'REJECTED')),
    trigger_finding_id UUID REFERENCES verification_findings(id),
    contract_ref VARCHAR(120),
    enforcement_type VARCHAR(50) NOT NULL DEFAULT 'APP_HOLD' CHECK (enforcement_type IN ('APP_HOLD', 'SMART_CONTRACT_ESCROW')),
    transition_reason TEXT NOT NULL,
    last_transition TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 6. Cryptographic Append-Only Audit Ledger
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sequence BIGSERIAL NOT NULL UNIQUE,
    actor_ref VARCHAR(255) NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason TEXT NOT NULL,
    before_hash VARCHAR(64),
    after_hash VARCHAR(64),
    prev_event_hash VARCHAR(64) NOT NULL,
    event_hash VARCHAR(64) NOT NULL UNIQUE,
    source_ref VARCHAR(100) NOT NULL DEFAULT 'TRUSTFABRIC_CORE'
);

-- -----------------------------------------------------------------------------
-- 7. Transactional Stored Procedures (ACID Enforcement)
-- -----------------------------------------------------------------------------

-- Atomic claim submission and duplicate nullifier check
CREATE OR REPLACE FUNCTION submit_claim_with_nullifier(
    p_grant_id UUID,
    p_vendor_ref VARCHAR,
    p_invoice_token VARCHAR,
    p_currency VARCHAR,
    p_amount_minor BIGINT,
    p_invoice_date DATE,
    p_category VARCHAR,
    p_purpose_ref TEXT,
    p_nullifier_hash VARCHAR
) RETURNS JSONB AS $$
DECLARE
    v_grant grants%ROWTYPE;
    v_claim_id UUID;
    v_existing_claim UUID;
    v_finding_id UUID;
    v_status VARCHAR;
BEGIN
    -- 1. Lock grant row to prevent concurrent over-allocation race condition
    SELECT * INTO v_grant FROM grants WHERE id = p_grant_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Grant % not found', p_grant_id;
    END IF;

    IF v_grant.allocated_amount_minor + p_amount_minor > v_grant.authorized_amount_minor THEN
        RAISE EXCEPTION 'Allocation limit exceeded: requested % exceeds authorized balance %',
            p_amount_minor, (v_grant.authorized_amount_minor - v_grant.allocated_amount_minor);
    END IF;

    -- 2. Check for Nullifier Collision across all donors and grants
    SELECT claim_id INTO v_existing_claim FROM expense_nullifiers WHERE nullifier_hash = p_nullifier_hash;

    IF v_existing_claim IS NOT NULL THEN
        -- Collision detected! Claim is created in ON_HOLD state
        v_status := 'ON_HOLD';
    ELSE
        v_status := 'CONDITION_PENDING';
    END IF;

    -- 3. Insert claim
    INSERT INTO expense_claims (
        grant_id, vendor_ref, invoice_number_token, currency,
        amount_minor, invoice_date, category, purpose_ref,
        disbursement_status
    ) VALUES (
        p_grant_id, p_vendor_ref, p_invoice_token, p_currency,
        p_amount_minor, p_invoice_date, p_category, p_purpose_ref,
        v_status
    ) RETURNING id INTO v_claim_id;

    -- 4. Register or flag nullifier
    IF v_existing_claim IS NOT NULL THEN
        -- Trigger discrepancy finding
        INSERT INTO verification_findings (
            grant_id, claim_id, type, severity, rule_id,
            explanation, affected_amount_minor, action_taken
        ) VALUES (
            p_grant_id, v_claim_id, 'DUPLICATE_CLAIM_DETECTED', 'CRITICAL', 'PS42-R09',
            format('Expense nullifier collision detected with existing claim %s across grant deeds.', v_existing_claim),
            p_amount_minor, 'Autonomous dispute hold placed on tranche; manual release blocked.'
        ) RETURNING id INTO v_finding_id;

        -- Create Escrow Case in ON_HOLD
        INSERT INTO escrow_cases (
            grant_id, claim_id, tranche_id, state, trigger_finding_id, transition_reason
        ) VALUES (
            p_grant_id, v_claim_id, format('tranche-%s', v_claim_id), 'ON_HOLD', v_finding_id,
            'Cryptographic nullifier collision detected at submission time.'
        );

        -- Update held minor on grant
        UPDATE grants SET held_amount_minor = held_amount_minor + p_amount_minor WHERE id = p_grant_id;
    ELSE
        -- Register unique nullifier
        INSERT INTO expense_nullifiers (nullifier_hash, claim_id, grant_id)
        VALUES (p_nullifier_hash, v_claim_id, p_grant_id);

        -- Create normal Escrow Case
        INSERT INTO escrow_cases (
            grant_id, claim_id, tranche_id, state, transition_reason
        ) VALUES (
            p_grant_id, v_claim_id, format('tranche-%s', v_claim_id), 'CONDITION_PENDING',
            'Registered with unique expense nullifier. Awaiting milestone attestation.'
        );
    END IF;

    -- Update grant allocated total
    UPDATE grants SET allocated_amount_minor = allocated_amount_minor + p_amount_minor WHERE id = p_grant_id;

    RETURN jsonb_build_object(
        'success', true,
        'claimId', v_claim_id,
        'status', v_status,
        'isDuplicate', (v_existing_claim IS NOT NULL)
    );
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 8. Row-Level Security (RLS) Policies
-- -----------------------------------------------------------------------------
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Read policies based on authenticated role
CREATE POLICY "Auditors and admins have full read access to grants"
    ON grants FOR SELECT
    USING (auth.jwt() ->> 'role' IN ('AUDITOR', 'FINANCE_ADMIN', 'SYSTEM_AGENT'));

CREATE POLICY "Donors can only view grants where donor_id matches"
    ON grants FOR SELECT
    USING (
        donor_id IN (
            SELECT id FROM donors WHERE wallet_address = auth.jwt() ->> 'wallet_address'
        )
    );

CREATE POLICY "Audit events are immutable and read-only"
    ON audit_events FOR SELECT
    USING (true);

-- Disallow direct client updates to audit trail
CREATE POLICY "Prevent client updates to audit_events"
    ON audit_events FOR UPDATE
    USING (false);

CREATE POLICY "Prevent client deletion from audit_events"
    ON audit_events FOR DELETE
    USING (false);
