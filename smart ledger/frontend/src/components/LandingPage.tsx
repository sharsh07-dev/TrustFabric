import React, { useState } from 'react';
import './LandingPage.css';
import { type NavTab } from './Layout';
import { type UserRole } from '../types/trustfabric';

interface LandingPageProps {
  onNavigate: (tab: NavTab) => void;
  currentUserRole: UserRole;
  onRoleChange: (role: UserRole) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigate,
  currentUserRole,
  onRoleChange,
}) => {
  // Calculator state
  const [calcTab, setCalcTab] = useState<'individual' | 'institutional'>('individual');
  const [amount, setAmount] = useState<number>(500);
  const [duration, setDuration] = useState<number>(4);
  const [activeTermPill, setActiveTermPill] = useState<'3' | '6' | '12'>('3');

  // Dynamic calculations
  const trancheAmount = Math.round(amount / duration);
  const familiesImpacted = Math.max(1, Math.round(amount / 10));

  return (
    <div className="tf-landing-root">
      {/* Top Utility Banner for Immediate Navigation to Dashboard */}
      <div style={{ background: '#0f172a', color: '#94a3b8', padding: '6px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', borderBottom: '1px solid #1e293b' }}>
        <div>
          <span>🛡️ <strong>TrustFabric Showcase</strong> &bull; Built with Reference Theme (ref1.png &amp; ref2.png)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => onNavigate('overview')}
            style={{
              background: '#FFB800',
              color: '#0f172a',
              fontWeight: 750,
              fontSize: '11px',
              padding: '4px 12px',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              letterSpacing: '0.3px'
            }}
          >
            ← Open Operations Dashboard
          </button>
        </div>
      </div>

      {/* ===================================================================
          Top Navigation Header (ref1.png)
          =================================================================== */}
      <header className="tf-landing-nav">
        <div className="tf-container">
          <div className="tf-nav-inner">
            <div className="tf-nav-brand" onClick={() => onNavigate('landing')}>
              <div className="tf-nav-logo-badge">🛡️</div>
              <div className="tf-nav-brand-text">
                Trust<span>Fabric</span>
              </div>
            </div>

            <nav className="tf-nav-links">
              <button className="tf-nav-link active" onClick={() => onNavigate('landing')}>
                Home
              </button>
              <button className="tf-nav-link" onClick={() => onNavigate('donate')}>
                Live Donation
              </button>
              <button className="tf-nav-link" onClick={() => onNavigate('grants')}>
                Grants & Policies
              </button>
              <button className="tf-nav-link" onClick={() => onNavigate('fundflows')}>
                Fund Flows
              </button>
              <button className="tf-nav-link" onClick={() => onNavigate('audit')}>
                Audit Proofs
              </button>
            </nav>

            <div className="tf-nav-actions">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '8px' }}>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>ROLE:</span>
                <select
                  value={currentUserRole}
                  onChange={(e) => onRoleChange(e.target.value as UserRole)}
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    cursor: 'pointer',
                  }}
                >
                  <option value="DONOR">Aarav (Donor)</option>
                  <option value="NGO_ADMIN">Meera (NGO Admin)</option>
                  <option value="FIELD_WORKER">Ravi (Vendor / Field)</option>
                  <option value="AUDITOR">Judge / Auditor</option>
                </select>
              </div>

              <button
                className="tf-btn-amber"
                onClick={() => onNavigate('donate')}
                title="Open Live Razorpay Test Mode Donation View"
              >
                TEST DONATE NOW
              </button>

              <button
                className="tf-btn-secondary"
                onClick={() => onNavigate('overview')}
                title="Open Administrative Dashboard"
              >
                LAUNCH CONSOLE
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ===================================================================
          Hero Section (Directly from ref1.png)
          =================================================================== */}
      <section className="tf-hero-section">
        <div className="tf-container">
          <div className="tf-hero-grid">
            {/* Left Column: Headlines & CTA */}
            <div>
              <h1 className="tf-hero-headline">
                Fast, verifiable & easy fund flows in real time
              </h1>
              <p className="tf-hero-subtext">
                Eliminate the black hole ledger. Connect Razorpay test donations, Firebase Realtime Database, and Sepolia on-chain commitments in one unified platform.
              </p>
              <div className="tf-hero-cta-group">
                <button
                  className="tf-btn-amber"
                  onClick={() => onNavigate('donate')}
                  style={{ padding: '14px 28px', fontSize: '14px' }}
                >
                  APPLY FOR DONATION NOW
                </button>
                <button
                  className="tf-btn-secondary"
                  onClick={() => onNavigate('audit')}
                  style={{ padding: '14px 24px', fontSize: '14px' }}
                >
                  LEARN MORE
                </button>
              </div>
            </div>

            {/* Right Column: Checklist & Highlight Cards (ref1.png) */}
            <div className="tf-hero-proof-grid">
              <div className="tf-checklist-card">
                <div className="tf-check-item">
                  <span className="tf-check-icon">✓</span>
                  <span>Get real-time test donation tracking</span>
                </div>
                <div className="tf-check-item">
                  <span className="tf-check-icon">✓</span>
                  <span>15-Second Razorpay Sandbox Checkout</span>
                </div>
                <div className="tf-check-item">
                  <span className="tf-check-icon">✓</span>
                  <span>Firebase RTDB Cloud Sync</span>
                </div>
                <div className="tf-check-item">
                  <span className="tf-check-icon">✓</span>
                  <span>Sepolia EVM Block Anchor</span>
                </div>
              </div>

              <div className="tf-numbered-cards-col">
                <div className="tf-numbered-card">
                  <div className="tf-num-title">1. Authoritative Provenance</div>
                  <div className="tf-num-desc">
                    Every event is labelled RAZORPAY_TEST_CAPTURED or ONCHAIN_ANCHORED_TESTNET with complete cryptographic integrity.
                  </div>
                </div>

                <div className="tf-numbered-card">
                  <div className="tf-num-title">2. Zero Black-Hole Leakage</div>
                  <div className="tf-num-desc">
                    Milestone disbursements are held until vendor invoices are authenticated by OCR and duplicate detection.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================
          Interactive Calculator & Products Widget (ref1.png Centerpiece)
          =================================================================== */}
      <section className="tf-calculator-section">
        <div className="tf-container">
          <div className="tf-calculator-card">
            {/* Tabs */}
            <div className="tf-calc-tabs">
              <button
                className={`tf-calc-tab ${calcTab === 'individual' ? 'active' : ''}`}
                onClick={() => setCalcTab('individual')}
              >
                Individual Donor
              </button>
              <button
                className={`tf-calc-tab ${calcTab === 'institutional' ? 'active' : ''}`}
                onClick={() => setCalcTab('institutional')}
              >
                Institutional CSR Grant
              </button>
            </div>

            {/* Body */}
            <div className="tf-calc-body">
              {/* Sliders Column */}
              <div className="tf-calc-slider-col">
                <div>
                  <div className="tf-slider-group">
                    <div className="tf-slider-header">
                      <span className="tf-slider-label">Select Donation / Grant Amount</span>
                      <span className="tf-slider-val">₹{amount.toLocaleString('en-IN')}</span>
                    </div>
                    <input
                      type="range"
                      min={calcTab === 'individual' ? 100 : 50000}
                      max={calcTab === 'individual' ? 25000 : 1500000}
                      step={calcTab === 'individual' ? 100 : 5000}
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      className="tf-slider-input"
                    />
                    <div className="tf-slider-bounds">
                      <span>{calcTab === 'individual' ? '₹100' : '₹50,000'}</span>
                      <span>{calcTab === 'individual' ? '₹25,000' : '₹15,00,000'}</span>
                    </div>
                  </div>

                  <div className="tf-slider-group">
                    <div className="tf-slider-header">
                      <span className="tf-slider-label">Select Impact Milestones / Tranches</span>
                      <span className="tf-slider-val">{duration} {duration === 1 ? 'Tranche' : 'Tranches'}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={12}
                      step={1}
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      className="tf-slider-input"
                    />
                    <div className="tf-slider-bounds">
                      <span>1 Tranche</span>
                      <span>12 Tranches</span>
                    </div>
                  </div>
                </div>

                <div className="tf-calc-output-box">
                  <div>
                    <div className="tf-calc-repayment-label">Estimated Tranche Release</div>
                    <div className="tf-calc-repayment-amount">₹{trancheAmount.toLocaleString('en-IN')} x {duration}</div>
                    <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600, marginTop: '2px' }}>
                      💧 Impact: ~{familiesImpacted} Families with clean water
                    </div>
                  </div>
                  <button
                    className="tf-btn-amber"
                    onClick={() => onNavigate('donate')}
                  >
                    DONATE NOW
                  </button>
                </div>
              </div>

              {/* Product 1: MicroRelief (ref1.png) */}
              <div className="tf-product-col">
                <div className="tf-help-icon" title="Instant community grant with Razorpay test checkout and Sepolia anchoring">?</div>
                <div>
                  <div className="tf-prod-tag">PRODUCT</div>
                  <div className="tf-prod-title">MicroRelief</div>
                  <div className="tf-prod-price-box">
                    <span className="tf-prod-price-upto">Up To</span>
                    <span className="tf-prod-price-amt">₹1,500</span>
                  </div>
                  <ul className="tf-prod-bullets">
                    <li className="tf-prod-bullet">
                      <span className="tick">✓</span>
                      <span>Instant Razorpay Test Checkout</span>
                    </li>
                    <li className="tf-prod-bullet">
                      <span className="tick">✓</span>
                      <span>Sub-second Firebase Broadcast</span>
                    </li>
                    <li className="tf-prod-bullet">
                      <span className="tick">✓</span>
                      <span>Sepolia Blockchain Anchor Hash</span>
                    </li>
                    <li className="tf-prod-bullet">
                      <span className="tick">✓</span>
                      <span>Direct Family Water Kits</span>
                    </li>
                  </ul>
                </div>
                <button
                  className="tf-btn-outline-prod"
                  onClick={() => onNavigate('donate')}
                >
                  APPLY FOR MICRORELIEF
                </button>
              </div>

              {/* Product 2: PlusEscrow (ref1.png) */}
              <div className="tf-product-col">
                <div className="tf-help-icon" title="Multi-milestone escrow contract with automated OCR receipt auditing">?</div>
                <div>
                  <div className="tf-prod-tag">PRODUCT</div>
                  <div className="tf-prod-title">PlusEscrow</div>
                  <div className="tf-prod-price-box">
                    <span className="tf-prod-price-upto">Up To</span>
                    <span className="tf-prod-price-amt">₹50,000+</span>
                  </div>
                  <ul className="tf-prod-bullets">
                    <li className="tf-prod-bullet">
                      <span className="tick">✓</span>
                      <span>Multi-Sig Milestone Disbursements</span>
                    </li>
                    <li className="tf-prod-bullet">
                      <span className="tick">✓</span>
                      <span>AI & OCR Tamper Detection</span>
                    </li>
                    <li className="tf-prod-bullet">
                      <span className="tick">✓</span>
                      <span>Duplicate Vendor Receipt Blocker</span>
                    </li>
                    <li className="tf-prod-bullet">
                      <span className="tick">✓</span>
                      <span>Cryptographic Audit Proof Trail</span>
                    </li>
                  </ul>
                </div>
                <button
                  className="tf-btn-outline-prod"
                  onClick={() => onNavigate('grants')}
                >
                  APPLY FOR PLUS ESCROW
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================
          How It Works (ref2.png Top)
          =================================================================== */}
      <section className="tf-how-section">
        <div className="tf-container">
          <div className="tf-section-eyebrow">End-to-End Workflow</div>
          <h2 className="tf-section-heading">How TrustFabric Verifies Fund Flows</h2>

          <div className="tf-steps-grid">
            <div className="tf-step-card">
              <div className="tf-step-badge">1</div>
              <h3 className="tf-step-title">Choose Loan / Grant Parameters</h3>
              <p className="tf-step-desc">
                Select from verified humanitarian campaigns (e.g. Clean Water for 50 Families), set target amounts, and preview tranche milestones.
              </p>
            </div>

            <div className="tf-step-card">
              <div className="tf-step-badge">2</div>
              <h3 className="tf-step-title">Submit Verification & Checkout</h3>
              <p className="tf-step-desc">
                Process donations via Razorpay Standard Test Mode. Backend verifies HMAC-SHA256 signatures and writes authoritative records to Firebase RTDB.
              </p>
            </div>

            <div className="tf-step-card">
              <div className="tf-step-badge">3</div>
              <h3 className="tf-step-title">Anchor on Sepolia & Release</h3>
              <p className="tf-step-desc">
                Commitment hashes are minted on the Sepolia EVM testnet. Escrow funds unlock only after vendor bills pass OCR and duplicate checks.
              </p>
            </div>
          </div>

          <button
            className="tf-btn-amber"
            onClick={() => onNavigate('donate')}
            style={{ padding: '14px 36px', fontSize: '14px' }}
          >
            APPLY NOW
          </button>
        </div>
      </section>

      {/* ===================================================================
          Trust & Qualification Section (ref1.png Bottom)
          =================================================================== */}
      <section className="tf-qualify-section">
        <div className="tf-container">
          <div className="tf-qualify-header">
            <h2 className="tf-qualify-title">Who Can Qualify for TrustFabric Fund Protection?</h2>
          </div>

          <div className="tf-qualify-grid">
            <div>
              <h3 className="tf-qualify-narrative-title">
                As long as your organization is an active non-profit, donor entity, or registered CSR initiative,
                you are eligible to run fully verifiable campaigns.
              </h3>
              <p className="tf-qualify-narrative-desc">
                TrustFabric provides zero-knowledge privacy: sensitive donor details and beneficiary addresses remain off-chain, while cryptographic proofs guarantee that zero capital vanishes into black hole ledgers.
              </p>
            </div>

            <div className="tf-qualify-checks-grid">
              <div className="tf-check-item">
                <span className="tf-check-icon">✓</span>
                <span>Be a Registered 80G / FCRA NGO</span>
              </div>
              <div className="tf-check-item">
                <span className="tf-check-icon">✓</span>
                <span>Verified Bank & Razorpay Merchant</span>
              </div>
              <div className="tf-check-item">
                <span className="tf-check-icon">✓</span>
                <span>Upload Field Evidence with Geo-Tags</span>
              </div>
              <div className="tf-check-item">
                <span className="tf-check-icon">✓</span>
                <span>Subject to Independent EVM Audit</span>
              </div>
            </div>
          </div>

          {/* Tabbed Term Strip (ref1.png Bottom) */}
          <div className="tf-term-strip">
            <div className="tf-term-example">
              <strong>EXAMPLE:</strong> A clean water grant of ₹50,000 for 3 months disburses ₹16,666 across 3 audited tranches with 100% cryptographic proof.
            </div>
            <div className="tf-term-pills">
              <button
                className={`tf-term-pill ${activeTermPill === '3' ? 'active' : ''}`}
                onClick={() => setActiveTermPill('3')}
              >
                3 MONTHS
              </button>
              <button
                className={`tf-term-pill ${activeTermPill === '6' ? 'active' : ''}`}
                onClick={() => setActiveTermPill('6')}
              >
                6 MONTHS
              </button>
              <button
                className={`tf-term-pill ${activeTermPill === '12' ? 'active' : ''}`}
                onClick={() => setActiveTermPill('12')}
              >
                12 MONTHS
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================
          Vibrant Yellow Callout Promo Banner (ref2.png Right)
          =================================================================== */}
      <section className="tf-promo-section">
        <div className="tf-container">
          <div className="tf-promo-banner">
            <div>
              <h2 className="tf-promo-title">
                Get your fund tracking and verified impact immediately
              </h2>
              <p className="tf-promo-subtext">
                Every test donation generates genuine Razorpay sandbox identifiers, synchronizes across cloud databases in under 1 second, and produces an immutable on-chain commitment on Sepolia.
              </p>
              <button
                className="tf-btn-white"
                onClick={() => onNavigate('donate')}
              >
                LEARN MORE NOW
              </button>
            </div>

            <div className="tf-promo-visual">
              <div className="tf-promo-receipt-header">
                <span>AUTHORITATIVE PROOF</span>
                <span style={{ color: '#16a34a' }}>VERIFIED</span>
              </div>
              <div className="tf-promo-receipt-row">
                <span>Payment Provider</span>
                <strong>Razorpay Test Mode</strong>
              </div>
              <div className="tf-promo-receipt-row">
                <span>Order Reference</span>
                <code>order_RZP9482103</code>
              </div>
              <div className="tf-promo-receipt-row">
                <span>Cloud Persistence</span>
                <span>Firebase RTDB</span>
              </div>
              <div className="tf-promo-receipt-row">
                <span>Blockchain Commitment</span>
                <code>Sepolia 0x71C2...9eF4</code>
              </div>
              <div className="tf-promo-receipt-row total">
                <span>Donation Amount</span>
                <span>₹500.00 (50,000 paise)</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================
          Non-Negotiable Truth in Labeling Disclosures (Section 0)
          =================================================================== */}
      <section className="tf-disclosures-bar">
        <div className="tf-container">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#0f172a' }}>
            <span>⚖️</span>
            <span>Non-Negotiable Truth in Labeling Disclosures</span>
          </div>
          <div className="tf-disclosures-grid">
            <div className="tf-disclosure-item">
              <span className="tf-disc-badge test">RAZORPAY_TEST_CAPTURED</span>
              <p className="tf-disc-text">
                Real interaction with Razorpay sandbox. Real test order & payment IDs generated. Does not transfer real-world fiat currency.
              </p>
            </div>
            <div className="tf-disclosure-item">
              <span className="tf-disc-badge rtdb">FIREBASE_PERSISTED</span>
              <p className="tf-disc-text">
                Real cloud persistence and WebSocket sync via Google Firebase Realtime Database. Zero unauthenticated client writes.
              </p>
            </div>
            <div className="tf-disclosure-item">
              <span className="tf-disc-badge chain">ONCHAIN_ANCHORED_TESTNET</span>
              <p className="tf-disc-text">
                Actual Sepolia EVM transaction with cryptographic hash commitment. The smart contract holds no fiat INR.
              </p>
            </div>
            <div className="tf-disclosure-item">
              <span className="tf-disc-badge seed">SEEDED_DEMO_DATA</span>
              <p className="tf-disc-text">
                Historical vendor bills and field photos are seeded demo records. Never represented as paid by newly initiated test donations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================
          Footer
          =================================================================== */}
      <footer className="tf-landing-footer">
        <div className="tf-container">
          <div className="tf-footer-grid">
            <div className="tf-footer-col">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ffffff', fontWeight: 800, fontSize: '18px', marginBottom: '12px' }}>
                <span style={{ color: '#F5A623' }}>🛡️</span> TrustFabric
              </div>
              <p style={{ fontSize: '13px', lineHeight: 1.6, maxWidth: '280px' }}>
                The Black Hole Ledger: Verifiable NGO Fund Flows. Built for CASCADE &apos;26 Theme 4, Problem 4.2.
              </p>
            </div>

            <div className="tf-footer-col">
              <h4>Platform</h4>
              <ul className="tf-footer-links">
                <li><button className="tf-footer-link" onClick={() => onNavigate('overview')}>Console Overview</button></li>
                <li><button className="tf-footer-link" onClick={() => onNavigate('donate')}>Live Razorpay Donation</button></li>
                <li><button className="tf-footer-link" onClick={() => onNavigate('grants')}>Grants & Policies</button></li>
                <li><button className="tf-footer-link" onClick={() => onNavigate('fundflows')}>Fund Flow Explorer</button></li>
              </ul>
            </div>

            <div className="tf-footer-col">
              <h4>Assurance</h4>
              <ul className="tf-footer-links">
                <li><button className="tf-footer-link" onClick={() => onNavigate('evidence')}>Evidence Workspace</button></li>
                <li><button className="tf-footer-link" onClick={() => onNavigate('findings')}>Compliance Findings</button></li>
                <li><button className="tf-footer-link" onClick={() => onNavigate('disbursement')}>Milestone Escrow</button></li>
                <li><button className="tf-footer-link" onClick={() => onNavigate('redteam')}>Red-Team Fraud Suite</button></li>
              </ul>
            </div>

            <div className="tf-footer-col">
              <h4>Auditor & Network</h4>
              <ul className="tf-footer-links">
                <li><button className="tf-footer-link" onClick={() => onNavigate('audit')}>Audit Trail Ledger</button></li>
                <li><a className="tf-footer-link" href="https://sepolia.etherscan.io/address/0x71C25bf4e37da4b7F2eFe341F21074eAf7096eF4" target="_blank" rel="noopener noreferrer">Sepolia Fiat Anchor</a></li>
                <li><a className="tf-footer-link" href="https://console.firebase.google.com/project/ngoledger/database" target="_blank" rel="noopener noreferrer">Firebase RTDB Console</a></li>
                <li><button className="tf-footer-link" onClick={() => onNavigate('settings')}>Health & Verification</button></li>
              </ul>
            </div>
          </div>

          <div className="tf-footer-bottom">
            <div>© 2026 TrustFabric Protocol. All rights reserved. Open-source verifiable grant accounting.</div>
            <div>Sepolia Chain ID: 11155111 | Razorpay Sandbox Enabled</div>
          </div>
        </div>
      </footer>
    </div>
  );
};
export default LandingPage;
