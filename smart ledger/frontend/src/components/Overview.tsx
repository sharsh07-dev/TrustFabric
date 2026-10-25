import React, { useState } from 'react';
import { type TrustFabricStoreState } from '../services/storage';
import { type VerificationFinding, type FlowEdge, type FinancialEvent } from '../types/trustfabric';

interface OverviewProps {
  state: TrustFabricStoreState;
  onNavigate: (tab: any, filterContext?: any) => void;
  onResolveFinding?: (findingId: string, actionType: string, reason: string) => void;
}

export const Overview: React.FC<OverviewProps> = ({ state, onNavigate, onResolveFinding }) => {
  const { grants, findings, escrowCases } = state;

  const [activeFinding, setActiveFinding] = useState<VerificationFinding | null>(null);
  const [activeHop, setActiveHop] = useState<{
    stepNumber: number;
    title: string;
    amount?: string;
    ref?: string;
    time?: string;
    status: string;
    statusClass?: string;
    description: string;
    edge?: FlowEdge;
    event?: FinancialEvent;
  } | null>(null);
  const [resolutionReason, setResolutionReason] = useState('');
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Authoritative figures from active database records
  const totalAllocatedMinor = grants.reduce((sum, g) => sum + g.allocatedMinor, 0);
  const totalSpentMinor = grants.reduce((sum, g) => sum + g.spentMinor, 0);
  const totalHeldMinor = grants.reduce((sum, g) => sum + g.heldMinor, 0);
  const totalUnreconciledMinor = grants.reduce((sum, g) => sum + g.unreconciledMinor, 0);
  const openFindings = findings.filter(f => f.findingStatus === 'OPEN');

  const handleApplyResolution = (actionType: string) => {
    if (!activeFinding) return;
    const reason = resolutionReason.trim() || 'Reviewed by Finance Officer and logged to audit trail.';
    if (onResolveFinding) {
      onResolveFinding(activeFinding.id, actionType, reason);
    }
    setActionSuccessMsg(`Finding updated: Action "${actionType}" applied.`);
    setResolutionReason('');
    setTimeout(() => {
      setActionSuccessMsg(null);
      setActiveFinding(null);
    }, 1200);
  };

  return (
    <div className="content-container">
      {/* 2.B: Compact Financial Overview Cards */}
      <div className="summary-strip">
        <div
          className="summary-metric clickable-metric"
          onClick={() => onNavigate('fundflows')}
          title="Click to view inbound donations in Fund Flows"
        >
          <span className="metric-label">Total Donations</span>
          <span className="metric-value tabular-nums">50.00 ETH</span>
          <span className="metric-sub">Earmarked on Ethereum Safe</span>
        </div>

        <div
          className="summary-metric clickable-metric"
          onClick={() => onNavigate('grants')}
          title="Click to inspect Grant Allocations"
        >
          <span className="metric-label">Allocated Funds</span>
          <span className="metric-value tabular-nums">₹{(totalAllocatedMinor / 100).toLocaleString()}</span>
          <span className="metric-sub">2 active purpose grants</span>
        </div>

        <div
          className="summary-metric clickable-metric"
          onClick={() => onNavigate('evidence')}
          title="Click to view Verified Expenditures"
        >
          <span className="metric-label">Verified Expenditure</span>
          <span className="metric-value tabular-nums" style={{ color: 'var(--primary-evergreen)' }}>
            ₹{(totalSpentMinor / 100).toLocaleString()}
          </span>
          <span className="metric-sub">Matched to authentic invoices</span>
        </div>

        <div
          className="summary-metric clickable-metric"
          onClick={() => onNavigate('fundflows')}
          title="Click to inspect Unreconciled Hops"
        >
          <span className="metric-label">Unreconciled Funds</span>
          <span className="metric-value tabular-nums" style={{ color: '#D97706' }}>
            ₹{(totalUnreconciledMinor / 100).toLocaleString()}
          </span>
          <span className="metric-sub">Bridge & invoice gaps</span>
        </div>

        <div
          className="summary-metric clickable-metric"
          onClick={() => onNavigate('disbursement')}
          title="Click to view Escrow Holds"
        >
          <span className="metric-label">Funds on Hold</span>
          <span className="metric-value tabular-nums" style={{ color: totalHeldMinor > 0 ? '#DC2626' : 'var(--text-primary)' }}>
            ₹{(totalHeldMinor / 100).toLocaleString()}
          </span>
          <span className="metric-sub">{escrowCases.filter(c => c.state === 'ON_HOLD').length} tranches non-releasable</span>
        </div>

        <div
          className="summary-metric clickable-metric"
          onClick={() => onNavigate('findings')}
          title="Click to review all Discrepancy Findings"
        >
          <span className="metric-label">Open Findings</span>
          <span className="metric-value tabular-nums" style={{ color: openFindings.length > 0 ? '#DC2626' : 'var(--primary-evergreen)' }}>
            {openFindings.length}
          </span>
          <span className="metric-sub">Requiring investigation</span>
        </div>
      </div>

      {/* Two Column Layout: Scannable Findings & Interactive Fund Lineage */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
        {/* 2.C: Compact, Scannable Findings Panel */}
        <div className="data-card">
          <div className="card-header">
            <div>
              <span className="card-title">Discrepancy Findings</span>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                {openFindings.length} pending review
              </span>
            </div>
            <button
              className="btn btn-secondary"
              style={{ fontSize: '11px', padding: '3px 8px' }}
              onClick={() => onNavigate('findings')}
            >
              View all ({findings.length}) →
            </button>
          </div>
          <div className="card-body" style={{ padding: '0' }}>
            {findings.slice(0, 5).map(f => {
              const isOpen = f.findingStatus === 'OPEN';
              return (
                <div
                  key={f.id}
                  style={{
                    padding: '12px 18px',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    backgroundColor: isOpen ? '#FFFFFF' : '#FBFBFB',
                    cursor: 'pointer',
                  }}
                  onClick={() => setActiveFinding(f)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                      <span className={`status-pill ${f.severity === 'CRITICAL' ? 'danger' : 'review'}`} style={{ fontSize: '10px', padding: '1px 6px' }}>
                        {f.severity}
                      </span>
                      <strong style={{ fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {f.title}
                      </strong>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {f.explanation}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
                    {f.affectedAmountMinor > 0 && (
                      <span className="tabular-nums" style={{ fontSize: '12.5px', fontWeight: 600, color: '#B91C1C' }}>
                        ₹{(f.affectedAmountMinor / 100).toLocaleString()}
                      </span>
                    )}
                    <span className={`status-pill ${f.findingStatus === 'RESOLVED' ? 'verified' : 'review'}`} style={{ fontSize: '10.5px' }}>
                      {f.findingStatus}
                    </span>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '11px', padding: '4px 10px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveFinding(f);
                      }}
                    >
                      Review
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2.D: Usable Multi-Hop Fund Lineage Panel */}
        <div className="data-card">
          <div className="card-header">
            <div>
              <span className="card-title">Fund Lineage Sequence</span>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                Grant CW-2026-014
              </span>
            </div>
            <button
              className="btn btn-secondary"
              style={{ fontSize: '11px', padding: '3px 8px' }}
              onClick={() => onNavigate('fundflows')}
            >
              Explorer →
            </button>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                {
                  stepNumber: 1,
                  title: 'Inbound Donation',
                  amount: '50.00 ETH',
                  status: 'SIMULATED',
                  statusClass: 'simulated',
                  ref: '0x3a9f...83921',
                  time: '2026-01-12 08:15',
                  description: 'Donation earmarked for Water Infrastructure on Ethereum Sepolia Safe.',
                },
                {
                  stepNumber: 2,
                  title: 'Token Swap (Uniswap V3)',
                  amount: 'ETH → $125,000 USDC',
                  status: 'SIMULATED',
                  statusClass: 'simulated',
                  ref: '0x8821...82734',
                  time: '2026-01-12 09:00',
                  description: 'Converted 50 ETH to 125,000 USDC at 2,500 USDC/ETH rate.',
                },
                {
                  stepNumber: 3,
                  title: 'Bridge Transfer (Polygon PoS)',
                  amount: '$124,850 USDC',
                  status: 'VERIFIED',
                  statusClass: 'verified',
                  ref: 'Polygon Relayer #54910283',
                  time: '2026-01-12 10:15',
                  description: 'Destination mint verified on Polygon after bridge lock proof.',
                },
                {
                  stepNumber: 4,
                  title: 'Fiat Settlement (Bank NEFT)',
                  amount: '₹42,500 INR',
                  status: 'SOURCE_ATTESTED',
                  statusClass: 'verified',
                  ref: 'HDFC NEFT #992148109',
                  time: '2026-02-16 11:20',
                  description: 'Cleared through RBI banking network to GreenBuild Supplies Ltd.',
                },
                {
                  stepNumber: 5,
                  title: 'Delivery Proof (Milestone 1)',
                  amount: '140m Well Borehole',
                  status: 'SOURCE_ATTESTED',
                  statusClass: 'verified',
                  ref: 'Ed25519 Lead Inspector',
                  time: '2026-02-18 14:00',
                  description: 'Hydrogeological survey & casing signed with unique replay-protected nonce.',
                },
              ].map((step) => (
                <div
                  key={step.stepNumber}
                  className="clickable-metric"
                  style={{
                    padding: '10px 14px',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  onClick={() => setActiveHop(step)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--bg-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {step.stepNumber}
                    </span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {step.title}
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                        Ref: {step.ref} • {step.time}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div className="tabular-nums" style={{ fontSize: '12.5px', fontWeight: 600 }}>
                      {step.amount}
                    </div>
                    <span className={`status-pill ${step.statusClass}`} style={{ fontSize: '10px' }}>
                      {step.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 2.C: Side Drawer for Finding Details */}
      {activeFinding && (
        <div className="drawer-backdrop" onClick={() => setActiveFinding(null)}>
          <div className="drawer-panel" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <span className={`status-pill ${activeFinding.severity === 'CRITICAL' ? 'danger' : 'review'}`} style={{ marginRight: '8px' }}>
                  {activeFinding.severity}
                </span>
                <strong style={{ fontSize: '15px' }}>{activeFinding.title}</strong>
              </div>
              <button
                onClick={() => setActiveFinding(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <div className="drawer-body">
              {actionSuccessMsg && (
                <div style={{ padding: '10px 14px', backgroundColor: 'var(--status-verified-bg)', border: '1px solid var(--status-verified-border)', color: 'var(--status-verified-text)', borderRadius: '4px', fontSize: '12.5px', fontWeight: 500 }}>
                  {actionSuccessMsg}
                </div>
              )}

              {/* What Happened */}
              <div>
                <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  What Happened
                </h4>
                <div style={{ fontSize: '13.5px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  {activeFinding.explanation}
                </div>
              </div>

              {/* Financial Impact */}
              {activeFinding.affectedAmountMinor > 0 && (
                <div style={{ padding: '12px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '4px' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#991B1B', fontWeight: 600 }}>Disputed Amount</div>
                  <div className="tabular-nums" style={{ fontSize: '18px', fontWeight: 700, color: '#B91C1C' }}>
                    ₹{(activeFinding.affectedAmountMinor / 100).toLocaleString()}
                  </div>
                </div>
              )}

              {/* Context Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12.5px' }}>
                <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-subtle)', borderRadius: '4px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Grant Scope</div>
                  <strong>{activeFinding.grantId}</strong>
                </div>
                <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-subtle)', borderRadius: '4px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Claim Reference</div>
                  <strong>{activeFinding.claimId || 'N/A (Multi-Hop)'}</strong>
                </div>
              </div>

              {/* Recommended Action */}
              <div style={{ padding: '12px', backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '4px', fontSize: '12.5px', color: '#92400E' }}>
                <strong>Recommended Action:</strong> {activeFinding.actionTaken}
              </div>

              {/* Resolution Form with Real Updates */}
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
                <h4 style={{ fontSize: '12.5px', fontWeight: 600, marginBottom: '8px' }}>
                  Take Administrative Action
                </h4>
                <div className="form-group">
                  <label className="form-label">Reviewer Rationale & Audit Justification:</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Enter review notes for permanent audit record..."
                    value={resolutionReason}
                    onChange={e => setResolutionReason(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '12px' }}
                    onClick={() => handleApplyResolution('MARKED_AS_REVIEWED')}
                  >
                    Mark as Reviewed
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '12px' }}
                    onClick={() => handleApplyResolution('ADDITIONAL_EVIDENCE_REQUESTED')}
                  >
                    Request Evidence
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ fontSize: '12px' }}
                    onClick={() => handleApplyResolution('ESCALATED_FOR_AUDIT')}
                  >
                    Escalate to Auditor
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: '12px' }}
                    onClick={() => handleApplyResolution('FORMALLY_RESOLVED')}
                  >
                    Resolve Discrepancy
                  </button>
                </div>
              </div>

              {/* Expandable Technical Details */}
              <details className="tech-details" style={{ marginTop: '8px' }}>
                <summary>Technical Details & Rule Hash</summary>
                <div style={{ marginTop: '8px', fontSize: '11.5px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>Rule Identifier: <span className="code-font">{activeFinding.ruleId}</span></div>
                  <div>Finding Hash: <span className="code-font">{activeFinding.id}</span></div>
                  <div>Evidence References: <span className="code-font">{activeFinding.evidenceRefs.join(', ')}</span></div>
                  <div>Detected At: {new Date(activeFinding.detectedAt).toISOString()}</div>
                </div>
              </details>
            </div>
          </div>
        </div>
      )}

      {/* 2.D: Popover/Drawer for Lineage Step Details */}
      {activeHop && (
        <div className="modal-backdrop" onClick={() => setActiveHop(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>Hop #{activeHop.stepNumber}: {activeHop.title}</span>
              <button
                onClick={() => setActiveHop(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}
              >
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Amount / Output:</span>
                <strong style={{ fontSize: '14px' }}>{activeHop.amount}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Verification Status:</span>
                <span className={`status-pill ${activeHop.status === 'VERIFIED' || activeHop.status === 'SOURCE_ATTESTED' ? 'verified' : 'simulated'}`}>
                  {activeHop.status}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Transaction / Proof Ref:</span>
                <span className="code-font">{activeHop.ref}</span>
              </div>
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '8px', fontSize: '12.5px', color: 'var(--text-primary)' }}>
                {activeHop.description}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setActiveHop(null)}>
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setActiveHop(null);
                  onNavigate('fundflows');
                }}
              >
                Open in Full Explorer →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
