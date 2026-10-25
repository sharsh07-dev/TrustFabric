import React, { useState } from 'react';
import { type TrustFabricStoreState } from '../services/storage';
import { DonorPortalService } from '../services/donorPortal';

interface DonorPortalProps {
  state: TrustFabricStoreState;
}

export const DonorPortal: React.FC<DonorPortalProps> = ({ state }) => {
  const [selectedDonorId, setSelectedDonorId] = useState('donor-northstar');

  const targetGrant = state.grants.find(g => g.donorId === selectedDonorId) || state.grants[0];

  const projectionResult = DonorPortalService.generateProjection({
    donorId: selectedDonorId,
    grant: targetGrant,
    claims: state.claims,
    flowEdges: state.flowEdges,
    deliveryAttestations: state.deliveryAttestations,
    findings: state.findings,
  });

  const projection = projectionResult.projection;

  return (
    <div className="content-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Donor Verification Portal (Privacy-Preserving Projection)
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Zero-knowledge beneficiary identity shielding with evidence-backed impact verification (PS42-R06)
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label className="form-label" style={{ margin: 0 }}>Authenticated Donor:</label>
          <select
            className="form-select"
            value={selectedDonorId}
            onChange={e => setSelectedDonorId(e.target.value)}
          >
            <option value="donor-northstar">Northstar Community Fund (Grant CW-2026-014)</option>
            <option value="donor-global-horizon">Global Horizon Foundation (Grant CW-2026-015)</option>
            <option value="unauthorized-donor-xyz">Unauthorized Donor XYZ (Test Access Denial)</option>
          </select>
        </div>
      </div>

      {!projectionResult.success && (
        <div style={{ padding: '20px', backgroundColor: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: '6px', color: '#991B1B', fontWeight: 600 }}>
          🛑 {projectionResult.error}
          <div style={{ fontSize: '12px', fontWeight: 400, marginTop: '4px' }}>
            AT-SEC-02 Compliance: Donors are strictly prohibited from querying or decrypting records from external grants.
          </div>
        </div>
      )}

      {projection && (
        <>
          {/* Privacy Attestation Banner */}
          <div style={{ padding: '12px 16px', backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '4px', fontSize: '12.5px', color: '#1E40AF', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🛡️</span>
            <div>{projection.privacyAttestation}</div>
          </div>

          {/* Donor Summary Strip */}
          <div className="summary-strip">
            <div className="summary-metric">
              <span className="metric-label">Committed Contribution</span>
              <span className="metric-value tabular-nums">₹{(projection.authorizedAmountMinor / 100).toLocaleString()}</span>
              <span className="metric-sub">{projection.grantCode}</span>
            </div>

            <div className="summary-metric">
              <span className="metric-label">Evidence-Backed Spent</span>
              <span className="metric-value tabular-nums" style={{ color: 'var(--primary-evergreen)' }}>
                ₹{(projection.spentMinor / 100).toLocaleString()}
              </span>
              <span className="metric-sub">100% Verified Evidence Hash</span>
            </div>

            <div className="summary-metric">
              <span className="metric-label">Escrowed Balance</span>
              <span className="metric-value tabular-nums">₹{(projection.remainingMinor / 100).toLocaleString()}</span>
              <span className="metric-sub">Protected by Smart Contract</span>
            </div>

            <div className="summary-metric">
              <span className="metric-label">Active Flags</span>
              <span className="metric-value tabular-nums" style={{ color: projection.openFindingsCount > 0 ? '#DC2626' : 'var(--primary-evergreen)' }}>
                {projection.openFindingsCount}
              </span>
              <span className="metric-sub">Discrepancy Notices</span>
            </div>
          </div>

          {/* Verified Milestones & Proofs */}
          <div className="data-card">
            <div className="card-header">
              <span className="card-title">Verified Milestone Delivery Proofs</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Cryptographically Signed Attestations</span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {projection.milestones.map(m => (
                <div key={m.id} style={{ padding: '14px', border: '1px solid var(--border-subtle)', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{m.title}</div>
                    <span className={`status-pill ${m.isMet ? 'verified' : 'review'}`}>
                      {m.isMet ? 'DELIVERY VERIFIED' : 'PENDING COMPLETION'}
                    </span>
                  </div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                    {m.deliveryStatementMasked}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
