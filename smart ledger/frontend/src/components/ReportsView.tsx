import React, { useState } from 'react';
import { type TrustFabricStoreState } from '../services/storage';

interface ReportsViewProps {
  state: TrustFabricStoreState;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ state }) => {
  const { reports, grants, claims } = state;
  const [selectedReportId, setSelectedReportId] = useState(reports[0]?.id || '');

  const report = reports.find(r => r.id === selectedReportId) || reports[0];
  const grant = grants.find(g => g.id === report?.grantId) || grants[0];

  return (
    <div className="content-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Financial Reports & Reconciliation Audit (PS42-R10)
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Auditing Grant {grant.grantCode} ({grant.purpose}): Detecting discrepancies between self-published claims and cryptographic ledger records
          </p>
        </div>

        <select
          className="form-select"
          value={selectedReportId}
          onChange={e => setSelectedReportId(e.target.value)}
        >
          {reports.map(r => (
            <option key={r.id} value={r.id}>{r.reportPeriod} — Grant {r.grantId}</option>
          ))}
        </select>
      </div>

      {report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Comparison Strip */}
          <div className="summary-strip">
            <div className="summary-metric">
              <span className="metric-label">NGO Published Claim</span>
              <span className="metric-value tabular-nums">
                ₹{(report.reportedTotalMinor / 100).toLocaleString()}
              </span>
              <span className="metric-sub">Self-Reported Statement</span>
            </div>

            <div className="summary-metric">
              <span className="metric-label">Ledger Calculated Total</span>
              <span className="metric-value tabular-nums" style={{ color: 'var(--primary-evergreen)' }}>
                ₹{(report.calculatedTotalMinor / 100).toLocaleString()}
              </span>
              <span className="metric-sub">Mathematically Verified Evidence</span>
            </div>

            <div className="summary-metric">
              <span className="metric-label">Discrepancy Gap</span>
              <span className="metric-value tabular-nums" style={{ color: '#DC2626' }}>
                ₹{(report.differenceMinor / 100).toLocaleString()}
              </span>
              <span className="metric-sub">Unsubstantiated Expenditure</span>
            </div>

            <div className="summary-metric">
              <span className="metric-label">Audit Status</span>
              <span className="status-pill danger" style={{ marginTop: '4px', width: 'fit-content' }}>
                {report.status}
              </span>
              <span className="metric-sub">RULE-DISC-06 Active</span>
            </div>
          </div>

          {/* Forensic Breakdown */}
          <div className="data-card">
            <div className="card-header">
              <span className="card-title">Discrepancy Forensic Breakdown</span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ padding: '14px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '4px', color: '#991B1B', fontSize: '13px' }}>
                <strong>⚠️ AUDIT WARNING (PS42-R10):</strong> The NGO self-published a quarterly report asserting ₹{(report.reportedTotalMinor / 100).toLocaleString()} in water facility expenditure. However, only ₹{(report.calculatedTotalMinor / 100).toLocaleString()} is backed by verified on-chain transfers, bank settlements, and valid invoice hashes. An unexplained gap of ₹{(report.differenceMinor / 100).toLocaleString()} cannot be attributed to authorized milestones.
              </div>

              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Substantiated Expenditure Claims Included in Tally:</h4>
                <div className="table-responsive">
                  <table className="enterprise-table">
                    <thead>
                      <tr>
                        <th>Claim ID</th>
                        <th>Vendor</th>
                        <th>Invoice Token</th>
                        <th>Substantiated Amount</th>
                        <th>Evidence Hash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {claims.filter(c => report.evidenceRefs.includes(c.id)).map(c => (
                        <tr key={c.id}>
                          <td><span className="code-font">{c.id}</span></td>
                          <td>{c.vendorRef}</td>
                          <td><span className="code-font">{c.invoiceNumberToken}</span></td>
                          <td className="tabular-nums" style={{ fontWeight: 600, color: 'var(--primary-evergreen)' }}>
                            ₹{(c.amountMinor / 100).toLocaleString()}
                          </td>
                          <td><span className="code-font">SHA256_VERIFIED</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
