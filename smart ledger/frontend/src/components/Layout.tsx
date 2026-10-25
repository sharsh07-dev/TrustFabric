import React, { useState, useEffect } from 'react';
import { SignInButton, SignUpButton, UserButton, useUser, useAuth } from '@clerk/react';
import { AuthService } from '../services/authService';
import { type UserRole } from '../types/trustfabric';

export type NavTab =
  | 'landing'
  | 'overview'
  | 'ngoverify'
  | 'grants'
  | 'donate'
  | 'fundflows'
  | 'evidence'
  | 'findings'
  | 'disbursement'
  | 'redteam'
  | 'audit'
  | 'donor'
  | 'reports'
  | 'settings';

interface LayoutProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  currentUserRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  openFindingsCount: number;
  onResetSeed: () => void;
  lastUpdated: string;
  onRefresh: () => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  activeTab,
  onTabChange,
  currentUserRole,
  onRoleChange,
  openFindingsCount,
  onResetSeed,
  lastUpdated,
  onRefresh,
  children,
}) => {
  const [showEnvPopover, setShowEnvPopover] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Clerk Authentication Hooks
  const { user: clerkUser } = useUser();
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (isSignedIn && clerkUser && getToken) {
      AuthService.getInstance().syncClerkSession(getToken, clerkUser).catch((err) => {
        console.warn('Clerk session sync error:', err);
      });
    }
  }, [isSignedIn, clerkUser, getToken]);

  return (
    <div className="app-shell">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <span style={{ fontSize: '18px' }}>🛡️</span>
            <span>TrustFabric</span>
          </div>
          <div className="sidebar-subtitle">NGO Fund Verification</div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-title">Public Showcase</div>
          <button
            className={`nav-item ${activeTab === 'landing' ? 'active' : ''}`}
            onClick={() => onTabChange('landing')}
          >
            <span>🌐 Website & Product</span>
          </button>

          <div className="nav-section-title">Workspace</div>
          <button
            className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => onTabChange('overview')}
          >
            <span>Overview</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'ngoverify' ? 'active' : ''}`}
            onClick={() => onTabChange('ngoverify')}
            style={{ position: 'relative' }}
          >
            <span>🛡️ NGO Verification</span>
            <span style={{ fontSize: '10px', background: '#F5A623', color: '#0f172a', fontWeight: 800, padding: '1px 5px', borderRadius: '3px' }}>
              LIVE
            </span>
          </button>

          <button
            className={`nav-item ${activeTab === 'donate' ? 'active' : ''}`}
            onClick={() => onTabChange('donate')}
          >
            <span>Live Donation (Razorpay)</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'grants' ? 'active' : ''}`}
            onClick={() => onTabChange('grants')}
          >
            <span>Grants & Policies</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'fundflows' ? 'active' : ''}`}
            onClick={() => onTabChange('fundflows')}
          >
            <span>Fund Flows</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'evidence' ? 'active' : ''}`}
            onClick={() => onTabChange('evidence')}
          >
            <span>Evidence</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'findings' ? 'active' : ''}`}
            onClick={() => onTabChange('findings')}
          >
            <span>Findings</span>
            {openFindingsCount > 0 && (
              <span className="nav-badge danger">{openFindingsCount}</span>
            )}
          </button>

          <button
            className={`nav-item ${activeTab === 'disbursement' ? 'active' : ''}`}
            onClick={() => onTabChange('disbursement')}
          >
            <span>Disbursements</span>
          </button>

          <div className="nav-section-title">Assurance</div>
          <button
            className={`nav-item ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => onTabChange('audit')}
          >
            <span>Audit Trail</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'donor' ? 'active' : ''}`}
            onClick={() => onTabChange('donor')}
          >
            <span>Donor Verification</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => onTabChange('reports')}
          >
            <span>Reports</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => onTabChange('settings')}
          >
            <span>Health & Configuration</span>
          </button>

          <div className="nav-section-title">Development & Demo</div>
          <button
            className={`nav-item ${activeTab === 'redteam' ? 'active' : ''}`}
            onClick={() => onTabChange('redteam')}
          >
            <span>Red-Team Tests (30%)</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          {isSignedIn ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', marginBottom: '8px' }}>
              <UserButton />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {clerkUser?.fullName || clerkUser?.primaryEmailAddress?.emailAddress?.split('@')[0] || 'Clerk User'}
                </div>
                <div style={{ fontSize: '9.5px', color: '#10B981', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <span>●</span> <span>Clerk ID ({currentUserRole})</span>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              <SignInButton mode="modal">
                <button className="btn btn-primary" style={{ flex: 1, fontSize: '11px', padding: '5px' }}>
                  Sign In
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="btn btn-secondary" style={{ flex: 1, fontSize: '11px', padding: '5px' }}>
                  Sign Up
                </button>
              </SignUpButton>
            </div>
          )}

          <div className="role-switcher-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-on-dark-dim)' }}>
                Authenticated Role:
              </span>
              <span style={{ fontSize: '9px', background: '#3B82F6', color: '#ffffff', fontWeight: 800, padding: '1px 5px', borderRadius: '4px' }}>
                Clerk RBAC
              </span>
            </div>
            <select
              style={{
                width: '100%',
                background: '#14181B',
                color: '#FFFFFF',
                border: '1px solid rgba(255,255,255,0.2)',
                padding: '5px 8px',
                borderRadius: '3px',
                fontSize: '12px',
                outline: 'none',
              }}
              value={currentUserRole}
              onChange={e => onRoleChange(e.target.value as UserRole)}
            >
              <option value="ADMIN">NGO Finance Admin (Write)</option>
              <option value="AUDITOR">Independent Auditor (Gatekeeper)</option>
              <option value="DONOR">Authenticated Donor (Read-Only)</option>
              <option value="FINANCE_OFFICER">Finance Officer</option>
            </select>
          </div>

          <button
            className="btn btn-secondary"
            style={{ width: '100%', fontSize: '11.5px', padding: '6px' }}
            onClick={() => setShowResetConfirm(true)}
          >
            Reset Demo Data...
          </button>
        </div>
      </aside>

      {/* Main Execution View */}
      <div className="main-wrapper">
        <header className="top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 className="page-title">
              {activeTab === 'overview' && 'Financial Overview'}
              {activeTab === 'grants' && 'Grants & Policies'}
              {activeTab === 'fundflows' && 'Fund Flows & Transaction Lineage'}
              {activeTab === 'evidence' && 'Evidence Workspace'}
              {activeTab === 'findings' && 'Discrepancy Findings'}
              {activeTab === 'disbursement' && 'Disbursement Controls'}
              {activeTab === 'redteam' && 'Adversarial Red-Team Suite'}
              {activeTab === 'audit' && 'Cryptographic Audit Trail'}
              {activeTab === 'donor' && 'Donor Verification Portal'}
              {activeTab === 'reports' && 'Financial Reports & Reconciliation'}
            </h1>
          </div>

          <div className="page-actions" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isSignedIn ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  {clerkUser?.primaryEmailAddress?.emailAddress}
                </span>
                <UserButton />
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <SignInButton mode="modal">
                  <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '11px' }}>
                    Sign In
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '11px' }}>
                    Sign Up
                  </button>
                </SignUpButton>
              </div>
            )}

            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Updated {lastUpdated}</span>
              <button
                className="btn btn-secondary"
                style={{ padding: '3px 8px', fontSize: '11px', lineHeight: 1 }}
                onClick={onRefresh}
                title="Refresh live ledger data"
              >
                ↻
              </button>
            </div>

            {/* Compact Header Status Badge per Section 2.A */}
            <div
              className="header-env-badge"
              onClick={() => setShowEnvPopover(!showEnvPopover)}
              title="Click to view environment and simulation details"
            >
              <span className="status-indicator-dot" />
              <span>Demo environment · External transfers simulated</span>
              <span style={{ fontSize: '9px', opacity: 0.7 }}>▾</span>
            </div>

            {/* Environment Details Popover */}
            {showEnvPopover && (
              <div className="popover-dropdown">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>System Environment Status</strong>
                  <button
                    onClick={() => setShowEnvPopover(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--text-muted)' }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-secondary)' }}>
                  <div>
                    <strong style={{ color: 'var(--primary-evergreen)' }}>✓ Live & Enforced Internally:</strong>
                    <ul style={{ paddingLeft: '16px', marginTop: '2px', fontSize: '12px' }}>
                      <li>Server-side SHA-256 evidence hashing</li>
                      <li>Cross-donor expense nullifier registry</li>
                      <li>Automated escrow freezing on conflict</li>
                      <li>Ed25519 milestone delivery signatures</li>
                      <li>Tamper-evident audit hash chain</li>
                    </ul>
                  </div>
                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '6px' }}>
                    <strong style={{ color: '#D97706' }}>⚠ Simulated External Feeds:</strong>
                    <ul style={{ paddingLeft: '16px', marginTop: '2px', fontSize: '12px' }}>
                      <li>Ethereum & Polygon blockchain RPC events</li>
                      <li>Commercial banking MT940 CAMT statement feeds</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </header>

        <main>
          {children}
        </main>
      </div>

      {/* Confirmation Dialog for Demo Reset per Journey 6 */}
      {showResetConfirm && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <span>Reset Demo Environment?</span>
              <button
                onClick={() => setShowResetConfirm(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              This will reseed all demonstration records for Grant <strong>CW-2026-014</strong>, including clean expenditures, multi-hop bridge flows, and test discrepancies. Any custom user-uploaded claims will be reset.
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  setShowResetConfirm(false);
                  onResetSeed();
                }}
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
