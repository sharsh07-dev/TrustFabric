import React, { useState } from 'react';
import { type TrustFabricStoreState } from '../services/storage';
import { LineageEngine } from '../services/lineageEngine';

interface FundFlowExplorerProps {
  state: TrustFabricStoreState;
}

export const FundFlowExplorer: React.FC<FundFlowExplorerProps> = ({ state }) => {
  const [selectedGrantId, setSelectedGrantId] = useState(state.grants[0]?.id || 'grant-cw-2026-014');

  const selectedGrant = state.grants.find(g => g.id === selectedGrantId) || state.grants[0];

  const timelineNodes = LineageEngine.buildGrantTimeline({
    grantId: selectedGrant.id,
    events: state.events,
    flowEdges: state.flowEdges,
    claims: state.claims,
    documents: state.documents,
    attestations: state.deliveryAttestations,
  });

  return (
    <div className="content-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Fund-Flow Explorer & Multi-Hop Lineage
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            End-to-end provenance graph: Donation → Swap → Bridge → Bank Clearance → Invoice Proof → Delivery Attestation (PS42-R18)
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label className="form-label" style={{ margin: 0 }}>Select Grant:</label>
          <select
            className="form-select"
            value={selectedGrantId}
            onChange={e => setSelectedGrantId(e.target.value)}
          >
            {state.grants.map(g => (
              <option key={g.id} value={g.id}>
                {g.grantCode} — {g.purpose.substring(0, 35)}...
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grant Summary Header */}
      <div className="data-card" style={{ padding: '16px 20px', backgroundColor: '#FFFFFF' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Active Grant Scope</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{selectedGrant.grantCode}</div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>{selectedGrant.purpose}</div>
          </div>
          <div style={{ display: 'flex', gap: '24px' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Authorized Cap</div>
              <div className="tabular-nums" style={{ fontSize: '15px', fontWeight: 600 }}>₹{(selectedGrant.authorizedAmountMinor / 100).toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Evidence-Backed Spent</div>
              <div className="tabular-nums" style={{ fontSize: '15px', fontWeight: 600, color: 'var(--primary-evergreen)' }}>₹{(selectedGrant.spentMinor / 100).toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Status</div>
              <span className="status-pill verified">{selectedGrant.status}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Linear Hop Timeline (DRD Screen E) */}
      <div className="data-card">
        <div className="card-header">
          <span className="card-title">Chronological Hop Verification Timeline</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Missing proofs are preserved as <span className="status-pill danger" style={{ fontSize: '10px' }}>UNRECONCILED GAPS</span> (Never Inferred)
          </span>
        </div>
        <div className="card-body">
          <div className="timeline-list">
            {timelineNodes.map((node, index) => (
              <div key={node.id} className="timeline-node">
                <div className={`timeline-dot ${node.hasGap ? 'gap' : ''}`} />
                <div className="timeline-content">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: '8px' }}>
                        HOP #{index + 1} • {node.stage}
                      </span>
                      <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', display: 'inline' }}>
                        {node.title}
                      </h4>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="tabular-nums" style={{ fontWeight: 700, fontSize: '13px' }}>
                        {node.amountFormatted}
                      </span>
                      <span className={`status-pill ${node.hasGap ? 'danger' : node.status === 'VERIFIED' ? 'verified' : 'simulated'}`}>
                        {node.status}
                      </span>
                    </div>
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    {node.provenanceDetails}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>Ref: <span className="code-font">{node.identifierRef}</span></span>
                    <span>Source: {node.sourceType} • {node.timestamp}</span>
                  </div>

                  {node.hasGap && (
                    <div style={{ marginTop: '8px', padding: '8px 12px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '4px', fontSize: '12px', color: '#991B1B' }}>
                      <strong>⚠️ UNRECONCILED DISCREPANCY GAP:</strong> {node.gapReason} (PS42-R20 requirement: Fund lineage cannot proceed to verified impact claim without this cryptographic proof).
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
