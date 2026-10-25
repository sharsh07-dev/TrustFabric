import React, { useState } from 'react';
import { type VerificationFinding } from '../types/trustfabric';
import { type TrustFabricStoreState } from '../services/storage';

interface FindingsListProps {
  state: TrustFabricStoreState;
  onUpdateState: (updated: Partial<TrustFabricStoreState>) => void;
}

export const FindingsList: React.FC<FindingsListProps> = ({ state, onUpdateState }) => {
  const [selectedFinding, setSelectedFinding] = useState<VerificationFinding | null>(state.findings[0] || null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'INVESTIGATING' | 'RESOLVED'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'WARNING'>('ALL');
  const [resolutionReason, setResolutionReason] = useState('');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [showOverrideWarning, setShowOverrideWarning] = useState(false);

  const filteredFindings = state.findings.filter(f => {
    const matchesSearch =
      f.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.explanation.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.ruleId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.grantId.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || f.findingStatus === statusFilter;
    const matchesSeverity = severityFilter === 'ALL' || f.severity === severityFilter;

    return matchesSearch && matchesStatus && matchesSeverity;
  });

  const handleExecuteAction = async (actionType: 'INVESTIGATING' | 'RESOLVED' | 'REQUEST_EVIDENCE' | 'ESCALATE') => {
    if (!selectedFinding) return;

    const isDuplicate =
      selectedFinding.type === 'DUPLICATE_CLAIM_DETECTED' ||
      selectedFinding.ruleId === 'PS42-R09';

    if (actionType === 'RESOLVED' && isDuplicate && resolutionReason.trim().length < 15) {
      setShowOverrideWarning(true);
      return;
    }
    setShowOverrideWarning(false);

    let newStatus: VerificationFinding['findingStatus'] = selectedFinding.findingStatus;
    let actionDesc = '';

    if (actionType === 'INVESTIGATING') {
      newStatus = 'INVESTIGATING';
      actionDesc = `Marked under active forensic investigation by ${state.currentUserRole}.`;
    } else if (actionType === 'REQUEST_EVIDENCE') {
      newStatus = 'INVESTIGATING';
      actionDesc = `Additional supplier delivery proof requested by ${state.currentUserRole}. Note: ${resolutionReason || 'Supplier invoice re-submission required.'}`;
    } else if (actionType === 'ESCALATE') {
      newStatus = 'INVESTIGATING';
      actionDesc = `Escalated finding to Oversight Committee & Donor. Rationale: ${resolutionReason || 'Discrepancy exceeds standard threshold.'}`;
    } else if (actionType === 'RESOLVED') {
      newStatus = 'RESOLVED';
      actionDesc = `Formally resolved by ${state.currentUserRole}. Rationale: ${resolutionReason.trim() || 'Verified against external source ledger.'}`;
    }

    const updatedFindings = state.findings.map(f => {
      if (f.id === selectedFinding.id) {
        return {
          ...f,
          findingStatus: newStatus,
          actionTaken: actionDesc,
        };
      }
      return f;
    });

    // Create append-only audit record
    const newAuditEvent = {
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      sequence: state.auditEvents.length + 1,
      actorRef: `USR-${state.currentUserRole.toLowerCase()}-01`,
      actorRole: state.currentUserRole,
      action: `FINDING_${actionType}`,
      entityType: 'FINDING',
      entityId: selectedFinding.id,
      timestamp: new Date().toISOString(),
      reason: actionDesc,
      prevEventHash: state.auditEvents.length > 0 ? state.auditEvents[state.auditEvents.length - 1].eventHash : '0000000000000000000000000000000000000000000000000000000000000000',
      eventHash: `f${Date.now().toString(16)}...hash`,
      sourceRef: 'TRUSTFABRIC_FORENSIC_ENGINE',
    };

    onUpdateState({
      findings: updatedFindings,
      auditEvents: [...state.auditEvents, newAuditEvent],
    });

    const updatedCurrent = updatedFindings.find(f => f.id === selectedFinding.id) || null;
    setSelectedFinding(updatedCurrent);
    setActionSuccess(`Action [${actionType}] successfully applied and recorded to audit ledger.`);
    setResolutionReason('');
    setTimeout(() => setActionSuccess(null), 3000);
  };

  return (
    <div className="content-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Discrepancy Findings & Forensic Review
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Automated verification alerts for unexplained transfers, duplicate claims, category breaches, and unverified milestones
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <span className="status-pill danger">
            {state.findings.filter(f => f.severity === 'CRITICAL' && f.findingStatus === 'OPEN').length} Critical Open
          </span>
          <span className="status-pill review">
            {state.findings.filter(f => f.findingStatus === 'INVESTIGATING').length} Under Investigation
          </span>
          <span className="status-pill verified">
            {state.findings.filter(f => f.findingStatus === 'RESOLVED').length} Resolved
          </span>
        </div>
      </div>

      {actionSuccess && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: 'var(--status-verified-bg)',
            border: '1px solid var(--status-verified-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            color: 'var(--status-verified-text)',
            fontWeight: 500,
          }}
        >
          ✓ {actionSuccess}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="data-card" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: '1 1 240px', minWidth: '200px' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search findings by title, rule ID, grant, or explanation..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Status:</label>
            <select
              className="form-select"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              <option value="ALL">All Statuses ({state.findings.length})</option>
              <option value="OPEN">Open</option>
              <option value="INVESTIGATING">Under Investigation</option>
              <option value="RESOLVED">Resolved</option>
            </select>

            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500, marginLeft: '6px' }}>Severity:</label>
            <select
              className="form-select"
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value as any)}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="WARNING">Warning</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedFinding ? '1.2fr 1fr' : '1fr', gap: '20px' }}>
        {/* Scannable Findings Table */}
        <div className="data-card">
          <div className="card-header">
            <span className="card-title">Active Discrepancy Ledger</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Showing {filteredFindings.length} of {state.findings.length} findings
            </span>
          </div>

          <div className="table-responsive">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Finding Title</th>
                  <th>Affected Amount</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredFindings.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      No discrepancy findings match the selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredFindings.map(finding => {
                    const isSelected = selectedFinding?.id === finding.id;
                    const isOpen = finding.findingStatus === 'OPEN';
                    const isInvestigating = finding.findingStatus === 'INVESTIGATING';

                    return (
                      <tr
                        key={finding.id}
                        onClick={() => setSelectedFinding(finding)}
                        style={{
                          cursor: 'pointer',
                          backgroundColor: isSelected ? 'var(--bg-subtle)' : undefined,
                        }}
                      >
                        <td>
                          <span className={`status-pill ${finding.severity === 'CRITICAL' ? 'danger' : 'review'}`}>
                            {finding.severity}
                          </span>
                        </td>
                        <td style={{ maxWidth: '280px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                            {finding.title}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {finding.explanation}
                          </div>
                        </td>
                        <td className="tabular-nums" style={{ color: finding.affectedAmountMinor > 0 ? '#B91C1C' : 'var(--text-secondary)', fontWeight: 600 }}>
                          {finding.affectedAmountMinor > 0 ? `₹${(finding.affectedAmountMinor / 100).toLocaleString()}` : '—'}
                        </td>
                        <td>
                          <span className={`status-pill ${finding.findingStatus === 'RESOLVED' ? 'verified' : isInvestigating ? 'review' : isOpen ? 'danger' : 'simulated'}`}>
                            {finding.findingStatus}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: '11px', padding: '3px 8px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFinding(finding);
                            }}
                          >
                            Review →
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Explainable Detail Side Panel */}
        {selectedFinding && (
          <div className="data-card" style={{ borderLeft: `4px solid ${selectedFinding.severity === 'CRITICAL' ? '#DC2626' : '#D97706'}` }}>
            <div className="card-header">
              <div>
                <span className="card-title">Finding Dossier</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                  {selectedFinding.id}
                </span>
              </div>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '11px', padding: '2px 6px' }}
                onClick={() => setSelectedFinding(null)}
              >
                ✕ Close
              </button>
            </div>

            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span className={`status-pill ${selectedFinding.severity === 'CRITICAL' ? 'danger' : 'review'}`}>
                    {selectedFinding.severity}
                  </span>
                  <span className={`status-pill ${selectedFinding.findingStatus === 'RESOLVED' ? 'verified' : 'review'}`}>
                    {selectedFinding.findingStatus}
                  </span>
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                  {selectedFinding.title}
                </h3>
              </div>

              {/* What happened & Why flagged */}
              <div style={{ padding: '12px', backgroundColor: 'var(--bg-subtle)', borderRadius: '4px', fontSize: '12.5px' }}>
                <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                  What Happened & Forensic Evaluation:
                </div>
                <div style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  {selectedFinding.explanation}
                </div>
              </div>

              {/* Financial & Entity References */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Grant Reference:</span>
                  <div className="code-font" style={{ fontWeight: 600 }}>{selectedFinding.grantId}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Claim / Tranche:</span>
                  <div className="code-font" style={{ fontWeight: 600 }}>{selectedFinding.claimId || 'N/A (Multi-Hop)'}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Disputed Impact:</span>
                  <div className="tabular-nums" style={{ fontWeight: 700, color: selectedFinding.affectedAmountMinor > 0 ? '#B91C1C' : 'var(--text-secondary)' }}>
                    {selectedFinding.affectedAmountMinor > 0 ? `₹${(selectedFinding.affectedAmountMinor / 100).toLocaleString()}` : 'Non-monetary compliance gap'}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Detected At:</span>
                  <div>{new Date(selectedFinding.detectedAt).toLocaleString()}</div>
                </div>
              </div>

              {/* Supporting Evidence References */}
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Evidence Documents Linked:</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                  {selectedFinding.evidenceRefs.map((ref, i) => (
                    <span key={i} className="code-font" style={{ padding: '2px 6px', background: 'var(--bg-subtle)', borderRadius: '3px', fontSize: '11px' }}>
                      {ref}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Enforced */}
              <div style={{ padding: '10px 12px', backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '4px', fontSize: '12px', color: '#92400E' }}>
                <strong>Automated Action:</strong> {selectedFinding.actionTaken}
              </div>

              {/* Expandable Technical Details (PS4.2 TRD requirement) */}
              <details className="tech-details">
                <summary>Technical Details & Verification Rules</summary>
                <div style={{ marginTop: '8px', fontSize: '11.5px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>Rule Identifier: <span className="code-font">{selectedFinding.ruleId}</span></div>
                  <div>Finding Classification: <span className="code-font">{selectedFinding.type}</span></div>
                  <div>Hash Identifier: <span className="code-font">{selectedFinding.id}</span></div>
                  <div>Source Ledger Node: <span className="code-font">node-alpha-sepolia-poly</span></div>
                </div>
              </details>

              {/* Interactive Resolution Actions */}
              {selectedFinding.findingStatus !== 'RESOLVED' && (
                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
                    Auditor Resolution Controls:
                  </div>

                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                      Documented Reason / Resolution Rationale (Required to Resolve):
                    </label>
                    <textarea
                      className="form-input"
                      rows={2}
                      placeholder="Enter documented findings or justification note..."
                      value={resolutionReason}
                      onChange={e => setResolutionReason(e.target.value)}
                      style={{ width: '100%', fontSize: '12px' }}
                    />
                  </div>

                  {showOverrideWarning && (
                    <div style={{ padding: '8px 10px', backgroundColor: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: '4px', fontSize: '11.5px', color: '#991B1B', marginBottom: '10px' }}>
                      ⚠️ <strong>Mandatory Duplicate Protection:</strong> Cryptographic duplicate collisions cannot be cleared without a detailed documented rationale of at least 15 characters.
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '11.5px', padding: '6px' }}
                      onClick={() => handleExecuteAction('INVESTIGATING')}
                    >
                      Mark Under Investigation
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '11.5px', padding: '6px' }}
                      onClick={() => handleExecuteAction('REQUEST_EVIDENCE')}
                    >
                      Request Evidence
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '11.5px', padding: '6px' }}
                      onClick={() => handleExecuteAction('ESCALATE')}
                    >
                      Escalate to Board
                    </button>
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: '11.5px', padding: '6px' }}
                      onClick={() => handleExecuteAction('RESOLVED')}
                    >
                      Formally Resolve Finding
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
