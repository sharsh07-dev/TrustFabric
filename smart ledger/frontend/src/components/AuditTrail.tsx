import React, { useState } from 'react';
import { type TrustFabricStoreState } from '../services/storage';
import { AuditLedgerService } from '../services/auditLedger';
import { type AuditEvent } from '../types/trustfabric';

interface AuditTrailProps {
  state: TrustFabricStoreState;
  auditLedger: AuditLedgerService;
  onUpdateState: (updated: Partial<TrustFabricStoreState>) => void;
}

export const AuditTrail: React.FC<AuditTrailProps> = ({ state, auditLedger, onUpdateState }) => {
  const [integrityResult, setIntegrityResult] = useState<{
    isValid: boolean;
    totalEvents: number;
    brokenEventSequence?: number;
    reason: string;
  } | null>(null);

  const [isVerifying, setIsVerifying] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [entityFilter, setEntityFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  const handleVerifyIntegrity = async () => {
    setIsVerifying(true);
    try {
      const result = await auditLedger.verifyChainIntegrity();
      setIntegrityResult(result);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSimulateTampering = async () => {
    // Deliberately tamper with event #1 reason to test AT-AUD-03
    auditLedger.tamperWithEventForTesting(1, 'MALICIOUS_MODIFICATION_TEST: Tampered grant purpose.');
    onUpdateState({ auditEvents: auditLedger.getEvents() });
    const result = await auditLedger.verifyChainIntegrity();
    setIntegrityResult(result);
  };

  const filteredEvents = state.auditEvents.filter(evt => {
    const matchesSearch =
      evt.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      evt.actorRef.toLowerCase().includes(searchTerm.toLowerCase()) ||
      evt.entityId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      evt.reason.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesEntity = entityFilter === 'ALL' || evt.entityType === entityFilter;
    const matchesRole = roleFilter === 'ALL' || evt.actorRole === roleFilter;

    return matchesSearch && matchesEntity && matchesRole;
  });

  return (
    <div className="content-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Cryptographic Tamper-Evident Audit Ledger
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Append-only sequential SHA-256 hash chain recording every grant allocation, evidence submission, finding resolution, and release attempt
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={handleSimulateTampering}>
            Simulate Tampering (AT-AUD-03)
          </button>
          <button className="btn btn-primary" onClick={handleVerifyIntegrity} disabled={isVerifying}>
            {isVerifying ? 'Verifying Hashes...' : 'Verify Chain Integrity'}
          </button>
        </div>
      </div>

      {integrityResult && (
        <div
          style={{
            padding: '14px 18px',
            backgroundColor: integrityResult.isValid ? 'var(--status-verified-bg)' : 'var(--status-danger-bg)',
            border: `1px solid ${integrityResult.isValid ? 'var(--status-verified-border)' : 'var(--status-danger-border)'}`,
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            color: integrityResult.isValid ? 'var(--status-verified-text)' : 'var(--status-danger-text)',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>
            {integrityResult.isValid ? '✓ AUDIT CHAIN INTEGRITY CONFIRMED' : '⚠️ CRYPTOGRAPHIC TAMPERING DETECTED'}
          </div>
          <div>{integrityResult.reason}</div>
          {integrityResult.brokenEventSequence && (
            <div style={{ marginTop: '4px', fontWeight: 600 }}>
              Tampered Sequence Block: #{integrityResult.brokenEventSequence}
            </div>
          )}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="data-card" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: '1 1 260px', minWidth: '220px' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search audit trail by actor, action, entity ID, or reason..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Entity:</label>
            <select
              className="form-select"
              value={entityFilter}
              onChange={e => setEntityFilter(e.target.value)}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              <option value="ALL">All Entities</option>
              <option value="GRANT">Grant</option>
              <option value="DISBURSEMENT">Disbursement</option>
              <option value="FINDING">Finding</option>
              <option value="EVIDENCE">Evidence</option>
              <option value="LINEAGE">Lineage</option>
            </select>

            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500, marginLeft: '6px' }}>Actor Role:</label>
            <select
              className="form-select"
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              <option value="ALL">All Roles</option>
              <option value="FINANCE_ADMIN">Finance Admin</option>
              <option value="AUDITOR">Auditor</option>
              <option value="FIELD_OFFICER">Field Officer</option>
              <option value="DONOR">Donor</option>
            </select>
          </div>
        </div>
      </div>

      {/* Audit Event Table */}
      <div className="data-card">
        <div className="card-header">
          <span className="card-title">Immutable Event Sequence</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Showing {filteredEvents.length} of {state.auditEvents.length} Chained Blocks
          </span>
        </div>
        <div className="table-responsive">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Seq #</th>
                <th>Action</th>
                <th>Actor / Role</th>
                <th>Target Entity</th>
                <th>Timestamp</th>
                <th>Block Hash</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    No audit records match the selected search criteria.
                  </td>
                </tr>
              ) : (
                filteredEvents.map(evt => (
                  <tr
                    key={evt.id}
                    onClick={() => setSelectedEvent(evt)}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: selectedEvent?.id === evt.id ? 'var(--bg-subtle)' : undefined,
                    }}
                  >
                    <td style={{ fontWeight: 700 }} className="tabular-nums">
                      #{evt.sequence}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{evt.action}</span>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '280px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {evt.reason}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '12.5px' }}>{evt.actorRef}</div>
                      <span className="status-pill simulated" style={{ fontSize: '10px' }}>{evt.actorRole}</span>
                    </td>
                    <td>
                      <span className="code-font">{evt.entityType}:{evt.entityId}</span>
                    </td>
                    <td style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                      {new Date(evt.timestamp).toLocaleString()}
                    </td>
                    <td>
                      <span className="code-font" title={evt.eventHash} style={{ color: 'var(--primary-evergreen)', fontWeight: 600 }}>
                        {evt.eventHash.substring(0, 10)}...
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: '11px', padding: '2px 6px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEvent(evt);
                        }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Event Details Modal / Drawer */}
      {selectedEvent && (
        <div className="modal-backdrop" onClick={() => setSelectedEvent(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>Audit Block #{selectedEvent.sequence} — {selectedEvent.action}</span>
              <button
                onClick={() => setSelectedEvent(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}
              >
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12.5px' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Actor Identity:</span>
                  <div style={{ fontWeight: 600 }}>{selectedEvent.actorRef} ({selectedEvent.actorRole})</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Recorded Timestamp:</span>
                  <div>{new Date(selectedEvent.timestamp).toISOString()}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Target Entity:</span>
                  <div className="code-font">{selectedEvent.entityType} • {selectedEvent.entityId}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Source Subsystem:</span>
                  <div className="code-font">{selectedEvent.sourceRef || 'TRUSTFABRIC_CORE'}</div>
                </div>
              </div>

              <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-subtle)', borderRadius: '4px', fontSize: '12px' }}>
                <strong>Operational Rationale:</strong>
                <div style={{ marginTop: '4px', color: 'var(--text-primary)' }}>{selectedEvent.reason}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11.5px' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Current Block SHA-256 Hash:</span>
                  <div className="code-font" style={{ wordBreak: 'break-all', color: 'var(--primary-evergreen)', padding: '4px', background: 'var(--bg-subtle)', borderRadius: '3px' }}>
                    {selectedEvent.eventHash}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Previous Block Hash (Parent):</span>
                  <div className="code-font" style={{ wordBreak: 'break-all', color: 'var(--text-secondary)', padding: '4px', background: 'var(--bg-subtle)', borderRadius: '3px' }}>
                    {selectedEvent.prevEventHash}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedEvent(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
