-- =============================================================================
-- TrustFabric Fiat Donation & On-Chain Anchor Schema
-- CASCADE '26 Theme 4 Problem 4.2: Verifiable NGO Fund Flows
-- Migration: 20260225010000_razorpay_fiat_anchor.sql
-- =============================================================================

-- 1. Donation Intents
CREATE TABLE IF NOT EXISTS donation_intents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    donation_code VARCHAR(100) NOT NULL UNIQUE,
    grant_id VARCHAR(100) NOT NULL,
    donor_id VARCHAR(100),
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    razorpay_order_id VARCHAR(100) NOT NULL UNIQUE,
    razorpay_payment_id VARCHAR(100) UNIQUE,
    state VARCHAR(50) NOT NULL DEFAULT 'CREATED' CHECK (state IN (
        'CREATED',
        'CHECKOUT_OPEN',
        'AUTHORIZED',
        'CAPTURED',
        'CAPTURED_ANCHOR_PENDING',
        'ANCHORED',
        'ANCHOR_FAILED',
        'FAILED',
        'CANCELLED',
        'REFUNDED',
        'PARTIALLY_REFUNDED'
    )),
    environment VARCHAR(20) NOT NULL DEFAULT 'TEST' CHECK (environment IN ('TEST', 'LIVE')),
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    client_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_donation_intents_grant ON donation_intents(grant_id);
CREATE INDEX IF NOT EXISTS idx_donation_intents_state ON donation_intents(state);
CREATE INDEX IF NOT EXISTS idx_donation_intents_rzp_order ON donation_intents(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_donation_intents_rzp_pay ON donation_intents(razorpay_payment_id);

-- 2. Razorpay Webhook Events
CREATE TABLE IF NOT EXISTS razorpay_webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_event_id VARCHAR(120) NOT NULL UNIQUE,
    event_type VARCHAR(100) NOT NULL,
    order_id VARCHAR(100),
    payment_id VARCHAR(100),
    signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
    processing_state VARCHAR(50) NOT NULL DEFAULT 'RECEIVED' CHECK (processing_state IN ('RECEIVED', 'PROCESSED', 'DUPLICATE_IGNORED', 'FAILED')),
    payload_safe_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rzp_webhook_event_id ON razorpay_webhook_events(provider_event_id);
CREATE INDEX IF NOT EXISTS idx_rzp_webhook_pay_id ON razorpay_webhook_events(payment_id);

-- 3. Payment Verification Events
CREATE TABLE IF NOT EXISTS payment_verification_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    donation_intent_id UUID REFERENCES donation_intents(id) ON DELETE CASCADE,
    verification_source VARCHAR(50) NOT NULL CHECK (verification_source IN ('CHECKOUT_CALLBACK', 'RAZORPAY_API_POLL', 'WEBHOOK')),
    signature_valid BOOLEAN NOT NULL,
    amount_matched BOOLEAN NOT NULL,
    currency_matched BOOLEAN NOT NULL,
    status_authoritative VARCHAR(50) NOT NULL,
    reason_code VARCHAR(100) NOT NULL,
    raw_response_digest VARCHAR(64) NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_verification_intent ON payment_verification_events(donation_intent_id);

-- 4. On-Chain Payment Anchors
CREATE TABLE IF NOT EXISTS onchain_payment_anchors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    donation_intent_id UUID NOT NULL REFERENCES donation_intents(id) ON DELETE CASCADE,
    payment_commitment VARCHAR(66) NOT NULL UNIQUE, -- 0x + 64 hex chars
    commitment_salt VARCHAR(64) NOT NULL,
    grant_ref_hash VARCHAR(66) NOT NULL,
    chain_id BIGINT NOT NULL, -- e.g. 11155111 for Sepolia, 31337 for Local EVM
    network_name VARCHAR(100) NOT NULL DEFAULT 'Ethereum Sepolia Testnet',
    contract_address VARCHAR(42) NOT NULL,
    relayer_address VARCHAR(42) NOT NULL,
    tx_hash VARCHAR(66),
    block_number BIGINT,
    gas_used BIGINT,
    receipt_status VARCHAR(20) CHECK (receipt_status IN ('SUCCESS', 'REVERTED', 'PENDING')),
    status VARCHAR(50) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('PENDING', 'SUBMITTED', 'CONFIRMED', 'REVERTED', 'RETRY_PENDING')),
    retry_count INT NOT NULL DEFAULT 0,
    explorer_url VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_anchors_commitment ON onchain_payment_anchors(payment_commitment);
CREATE INDEX IF NOT EXISTS idx_payment_anchors_tx ON onchain_payment_anchors(tx_hash);

-- 5. Payment Audit Events (Immutable Append-Oriented Log)
CREATE TABLE IF NOT EXISTS payment_audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sequence_number BIGSERIAL UNIQUE,
    donation_intent_id UUID REFERENCES donation_intents(id) ON DELETE SET NULL,
    actor_ref VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    previous_state VARCHAR(50),
    new_state VARCHAR(50) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    prev_event_hash VARCHAR(64),
    event_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_audit_seq ON payment_audit_events(sequence_number);
CREATE INDEX IF NOT EXISTS idx_payment_audit_intent ON payment_audit_events(donation_intent_id);

-- Row-Level Security Policies
ALTER TABLE donation_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE razorpay_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_verification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE onchain_payment_anchors ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_audit_events ENABLE ROW LEVEL SECURITY;

-- Anonymous public can only view confirmed anchors and non-PII donation totals
CREATE POLICY "Public read confirmed anchors" ON onchain_payment_anchors
    FOR SELECT USING (status = 'CONFIRMED');

CREATE POLICY "Public read verified payment status" ON donation_intents
    FOR SELECT USING (state IN ('CAPTURED', 'ANCHORED'));

-- Service role has full administrative access
CREATE POLICY "Service full access donation_intents" ON donation_intents
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service full access webhook_events" ON razorpay_webhook_events
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service full access verification_events" ON payment_verification_events
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service full access payment_anchors" ON onchain_payment_anchors
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service full access payment_audit_events" ON payment_audit_events
    FOR ALL USING (auth.role() = 'service_role');
