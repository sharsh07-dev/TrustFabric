import React, { useState } from 'react';
import { SignInButton, SignUpButton, UserButton, useUser, useAuth } from '@clerk/react';
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
  const { user: clerkUser } = useUser();
  const { isSignedIn } = useAuth();
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
      {/* ===================================================================
          Top Navigation Header
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
              <button
                className="tf-nav-link tf-nav-link-highlight"
                onClick={() => onNavigate('ngoverify')}
              >
                NGO Verification
                <span className="tf-nav-live-dot"></span>
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
              {isSignedIn ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', background: 'rgba(255,255,255,0.08)', borderRadius: '20px' }}>
                  <UserButton />
                  <span style={{ fontSize: '11px', color: '#E2E8F0', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {clerkUser?.primaryEmailAddress?.emailAddress || 'Authenticated'}
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <SignInButton mode="modal">
                    <button className="tf-btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                      Sign In
                    </button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button className="tf-btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', background: 'rgba(255,255,255,0.1)' }}>
                      Sign Up
                    </button>
                  </SignUpButton>
                </div>
              )}

              <div className="tf-nav-role-box" title="Active Cryptographic Clerk & RBAC Session">
                <span style={{ fontSize: '9px', background: '#3B82F6', color: '#ffffff', fontWeight: 800, padding: '2px 6px', borderRadius: '10px' }}>
                  CLERK ACTIVE
                </span>
                <span className="tf-nav-role-label">ROLE:</span>
                <select
                  value={currentUserRole}
                  onChange={(e) => onRoleChange(e.target.value as UserRole)}
                  className="tf-nav-role-select"
                >
                  <option value="DONOR">Aarav (Donor)</option>
                  <option value="ADMIN">Meera (NGO Admin)</option>
                  <option value="AUDITOR">Judge / Auditor</option>
                  <option value="FINANCE_OFFICER">Finance Officer</option>
                </select>
              </div>

              <button
                className="tf-btn-amber"
                onClick={() => onNavigate('donate')}
                title="Donate on Ethereum Sepolia with Self-Custody Wallet"
              >
                DONATE ON SEPOLIA
              </button>

              <button
                className="tf-btn-secondary"
                onClick={() => onNavigate('overview')}
                title="Open Operations Dashboard"
              >
                OPERATIONS CONSOLE →
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
                Eliminate the black hole ledger. Direct Web3 wallet donations, real-time on-chain tracking, and immutable Sepolia commitments with zero intermediary fees.
              </p>
              <div className="tf-hero-cta-group">
                <button
                  className="tf-btn-amber"
                  onClick={() => onNavigate('donate')}
                  style={{ padding: '14px 28px', fontSize: '14px' }}
                >
                  DONATE ON SEPOLIA NOW
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
                  <span>Real-Time On-Chain Transaction Tracker</span>
                </div>
                <div className="tf-check-item">
                  <span className="tf-check-icon">✓</span>
                  <span>Self-Custody Wallet Direct Donation</span>
                </div>
                <div className="tf-check-item">
                  <span className="tf-check-icon">✓</span>
                  <span>Zero Intermediary Fees (0% Skimming)</span>
                </div>
                <div className="tf-check-item">
                  <span className="tf-check-icon">✓</span>
                  <span>Sepolia EVM Block Inclusion & Log Verification</span>
                </div>
              </div>

              <div className="tf-numbered-cards-col">
                <div className="tf-numbered-card">
                  <div className="tf-num-title">1. Authoritative Provenance</div>
                  <div className="tf-num-desc">
                    Every donation is verified directly against Ethereum Sepolia logs with complete cryptographic integrity.
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
                <div className="tf-help-icon" title="Instant community grant with direct wallet settlement and on-chain event tracking">?</div>
                <div>
                  <div className="tf-prod-tag">PRODUCT</div>
                  <div className="tf-prod-title">MicroRelief</div>
                  <div className="tf-prod-price-box">
                    <span className="tf-prod-price-upto">Up To</span>
                    <span className="tf-prod-price-amt">0.5 ETH</span>
                  </div>
                  <ul className="tf-prod-bullets">
                    <li className="tf-prod-bullet">
                      <span className="tick">✓</span>
                      <span>Direct Web3 Wallet Settlement</span>
                    </li>
                    <li className="tf-prod-bullet">
                      <span className="tick">✓</span>
                      <span>Zero Intermediary Fees (0% Cut)</span>
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
                    <span className="tf-prod-price-amt">5.0+ ETH</span>
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
              <h3 className="tf-step-title">Connect Wallet & Submit Donation</h3>
              <p className="tf-step-desc">
                Sign and submit directly through your Web3 wallet. Smart contract forwards funds atomically to the verified NGO recipient.
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
                <span>Verified NGO Recipient Smart Contract</span>
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
              <strong>EXAMPLE:</strong> A clean water grant of 1.5 ETH for 3 months disburses 0.5 ETH across 3 audited tranches with 100% cryptographic proof.
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
                Every donation executes directly on Ethereum Sepolia, emits verifiable DonationReceived events, and provides real-time transaction tracking without centralized payment intermediaries.
              </p>
              <button
                className="tf-btn-white"
                onClick={() => onNavigate('donate')}
              >
                DONATE ON SEPOLIA NOW
              </button>
            </div>

            <div className="tf-promo-visual">
              <div className="tf-promo-receipt-header">
                <span>AUTHORITATIVE PROOF</span>
                <span style={{ color: '#16a34a' }}>VERIFIED</span>
              </div>
              <div className="tf-promo-receipt-row">
                <span>Settlement Rail</span>
                <strong>Ethereum Sepolia EVM</strong>
              </div>
              <div className="tf-promo-receipt-row">
                <span>Contract Reference</span>
                <code>Sepolia 0x71C2...9eF4</code>
              </div>
              <div className="tf-promo-receipt-row">
                <span>Transaction Tracker</span>
                <span>Real-Time Etherscan Logs</span>
              </div>
              <div className="tf-promo-receipt-row">
                <span>Campaign Event</span>
                <code>DonationReceived</code>
              </div>
              <div className="tf-promo-receipt-row total">
                <span>Donation Amount</span>
                <span>0.01 ETH (~$35.00)</span>
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
              <span className="tf-disc-badge test">ONCHAIN_EVM_SETTLEMENT</span>
              <p className="tf-disc-text">
                Real interaction with Ethereum Sepolia smart contract. Donor funds route directly to the campaign recipient via EVM consensus.
              </p>
            </div>
            <div className="tf-disclosure-item">
              <span className="tf-disc-badge rtdb">EVENT_INDEXED_SYNC</span>
              <p className="tf-disc-text">
                Authoritative event logs indexed directly from blockchain blocks. Disposable read cache with zero custodial server escrow.
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
                <li><button className="tf-footer-link" onClick={() => onNavigate('donate')}>Verified Donation Portal</button></li>
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
            <div>Sepolia Chain ID: 11155111 | Decentralized Web3 & Direct Bank Rails Enabled</div>
          </div>
        </div>
      </footer>
    </div>
  );
};
export default LandingPage;
