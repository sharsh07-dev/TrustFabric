import React, { useState } from 'react';
import { type TrustFabricStoreState } from '../services/storage';
import { EvidenceService } from '../services/evidenceService';
import { DuplicateEngine } from '../services/duplicateEngine';

interface EvidenceWorkspaceProps {
  state: TrustFabricStoreState;
  onUpdateState: (updated: Partial<TrustFabricStoreState>) => void;
  evidenceService: EvidenceService;
  duplicateEngine: DuplicateEngine;
}

export const EvidenceWorkspace: React.FC<EvidenceWorkspaceProps> = ({
  state,
  onUpdateState,
  evidenceService,
  duplicateEngine,
}) => {
  const [vendorName, setVendorName] = useState('AquaTech Filtration Solutions');
  const [invoiceNumber, setInvoiceNumber] = useState('INV-2026-9042');
  const [amountRupees, setAmountRupees] = useState('38500');
  const currency = 'INR';
  const [invoiceDate, setInvoiceDate] = useState('2026-02-22');
  const [selectedGrantId, setSelectedGrantId] = useState(state.grants[0]?.id || 'grant-cw-2026-014');
  const [category, setCategory] = useState('Water Infrastructure');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [processingStage, setProcessingStage] = useState<string>('');
  const [uploadFeedback, setUploadFeedback] = useState<{ type: 'success' | 'danger'; message: string; details?: any } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUploadAndVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setUploadFeedback(null);

    try {
      const amountMinor = Math.round(parseFloat(amountRupees) * 100);
      if (isNaN(amountMinor) || amountMinor <= 0) {
        throw new Error('Please enter a valid positive invoice amount.');
      }

      // Read file bytes or generate synthetic document bytes
      let fileBytes: Uint8Array;
      let filename = selectedFile ? selectedFile.name : `Invoice_${invoiceNumber}_${vendorName.replace(/\s+/g, '')}.pdf`;
      let mimeType = selectedFile ? selectedFile.type : 'application/pdf';

      setProgressPercent(25);
      setProcessingStage('Reading and validating document bytes...');
      await new Promise(r => setTimeout(r, 120));

      if (selectedFile) {
        const buffer = await selectedFile.arrayBuffer();
        fileBytes = new Uint8Array(buffer);
      } else {
        // Synthetic sample document bytes
        const syntheticStr = `SYNTHETIC_PDF_INVOICE|VENDOR:${vendorName}|INV:${invoiceNumber}|AMT:${amountMinor}|DATE:${invoiceDate}`;
        fileBytes = new TextEncoder().encode(syntheticStr);
      }

      const claimId = `claim-${Date.now()}`;

      setProgressPercent(60);
      setProcessingStage('Computing server-side SHA-256 digest & canonical commitment v1.0...');
      await new Promise(r => setTimeout(r, 150));

      // Ingest document through EvidenceService (computes SHA-256 and commitments)
      const ingestResult = await evidenceService.ingestDocument({
        claimId,
        filename,
        mimeType: mimeType || 'application/pdf',
        fileBytes,
        uploadedBy: 'finance_officer_current',
        extractedFields: {
          vendorName,
          invoiceNumber,
          date: invoiceDate,
          totalAmountMinor: amountMinor,
          currency,
          isOcrExtracted: false, // Honestly marked as user-entered / verified form
        },
      });

      setProgressPercent(85);
      setProcessingStage('Checking cross-donor expense nullifier registry for collisions...');
      await new Promise(r => setTimeout(r, 120));

      const newClaim = {
        id: claimId,
        grantId: selectedGrantId,
        vendorRef: vendorName,
        invoiceNumberToken: invoiceNumber,
        currency,
        amountMinor,
        invoiceDate: new Date(invoiceDate).toISOString(),
        category,
        purposeRef: `Authorized expenditure under Grant ${selectedGrantId}`,
        claimStatus: 'SUBMITTED' as const,
        disbursementStatus: 'CONDITION_PENDING' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Check for exact byte duplicate
      const byteDuplicate = duplicateEngine.checkByteDuplicate(ingestResult.document);

      // Check for normalized invoice claim duplicate
      const normDuplicate = duplicateEngine.checkNormalizedClaimDuplicate(newClaim, state.claims);

      // Atomic expense nullifier registry check (PS42-R16 & PS42-R17)
      const nullifierResult = await duplicateEngine.registerExpenseNullifier(newClaim, {
        vendorName,
        invoiceNumber,
        totalAmountMinor: amountMinor,
        currency,
        date: invoiceDate,
      });

      // Index document for future queries
      duplicateEngine.indexDocument(ingestResult.document);

      const updatedDocuments = [...state.documents, ingestResult.document];
      const updatedClaims = [...state.claims, newClaim];
      const updatedFindings = [...state.findings];

      if (byteDuplicate) {
        updatedFindings.push({
          id: `find-byte-${Date.now()}`,
          grantId: selectedGrantId,
          claimId,
          type: 'DUPLICATE_CLAIM_DETECTED',
          severity: 'CRITICAL',
          ruleId: 'RULE-DUP-01',
          title: 'Exact Byte-Level File Hash Duplicate Detected',
          explanation: `Uploaded file hash matches prior document in Claim ${byteDuplicate.matchedClaimId}. Cross-report duplicate prevention active.`,
          evidenceRefs: [claimId, byteDuplicate.matchedClaimId],
          affectedAmountMinor: amountMinor,
          findingStatus: 'OPEN',
          actionTaken: 'Escrow release frozen via automated policy.',
          detectedAt: new Date().toISOString(),
        });
      }

      if (normDuplicate) {
        updatedFindings.push({
          id: `find-norm-${Date.now()}`,
          grantId: selectedGrantId,
          claimId,
          type: 'DUPLICATE_CLAIM_DETECTED',
          severity: 'HIGH',
          ruleId: 'RULE-DUP-02',
          title: 'Normalized Invoice Claim Duplicate Detected',
          explanation: `Claim tuple matches previously recorded Claim ${normDuplicate.matchedClaimId}.`,
          evidenceRefs: [claimId, normDuplicate.matchedClaimId],
          affectedAmountMinor: amountMinor,
          findingStatus: 'OPEN',
          actionTaken: 'Flagged for cross-report audit.',
          detectedAt: new Date().toISOString(),
        });
      }

      if (nullifierResult.finding) {
        updatedFindings.push(nullifierResult.finding);
      }

      onUpdateState({
        documents: updatedDocuments,
        claims: updatedClaims,
        findings: updatedFindings,
      });

      if (!nullifierResult.success || byteDuplicate) {
        setUploadFeedback({
          type: 'danger',
          message: 'DUPLICATE COLLISION DETECTED: This expense nullifier was previously claimed! Automated policy has triggered an escrow freeze.',
          details: {
            sha256: ingestResult.document.sha256,
            nullifier: ingestResult.expenseNullifier,
            matchedClaim: nullifierResult.duplicateMatch?.matchedClaimId || byteDuplicate?.matchedClaimId,
          },
        });
      } else {
        setUploadFeedback({
          type: 'success',
          message: 'Evidence document ingested and committed successfully.',
          details: {
            sha256: ingestResult.document.sha256,
            canonicalCommitment: ingestResult.canonicalCommitment,
            nullifier: ingestResult.expenseNullifier,
          },
        });
      }
    } catch (err: any) {
      setUploadFeedback({
        type: 'danger',
        message: err.message || 'Failed to process document upload.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="content-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Expenditure Evidence & Cryptographic Commitments
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Server-side SHA-256 computation, versioned canonicalization, and privacy-preserving expense nullifiers (PS42-R05, PS42-R16)
          </p>
        </div>
      </div>

      {uploadFeedback && (
        <div
          style={{
            padding: '14px 18px',
            backgroundColor: uploadFeedback.type === 'success' ? 'var(--status-verified-bg)' : 'var(--status-danger-bg)',
            border: `1px solid ${uploadFeedback.type === 'success' ? 'var(--status-verified-border)' : 'var(--status-danger-border)'}`,
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            color: uploadFeedback.type === 'success' ? 'var(--status-verified-text)' : 'var(--status-danger-text)',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>{uploadFeedback.message}</div>
          {uploadFeedback.details && (
            <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div>File SHA-256 Digest: <span className="code-font">{uploadFeedback.details.sha256}</span></div>
              {uploadFeedback.details.canonicalCommitment && (
                <div>Canonical Commitment: <span className="code-font">{uploadFeedback.details.canonicalCommitment}</span></div>
              )}
              {uploadFeedback.details.nullifier && (
                <div>Expense Nullifier: <span className="code-font">{uploadFeedback.details.nullifier}</span></div>
              )}
              {uploadFeedback.details.matchedClaim && (
                <div style={{ color: '#991B1B', fontWeight: 600 }}>Collided with Prior Claim ID: {uploadFeedback.details.matchedClaim}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Ingestion Form & Cross-Donor Duplicate Test */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
        <div className="data-card">
          <div className="card-header">
            <span className="card-title">Ingest New Invoice Document</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Private Vault Storage (Off-Chain)</span>
          </div>
          <div className="card-body">
            <form onSubmit={handleUploadAndVerify}>
              <div className="form-group">
                <label className="form-label">Target Grant:</label>
                <select className="form-select" value={selectedGrantId} onChange={e => setSelectedGrantId(e.target.value)}>
                  {state.grants.map(g => (
                    <option key={g.id} value={g.id}>{g.grantCode} ({g.purpose.substring(0, 30)}...)</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Vendor Name:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={vendorName}
                    onChange={e => setVendorName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Invoice Reference Token:</label>
                  <input
                    type="text"
                    className="form-input"
                    value={invoiceNumber}
                    onChange={e => setInvoiceNumber(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Amount (₹ INR):</label>
                  <input
                    type="number"
                    className="form-input"
                    value={amountRupees}
                    onChange={e => setAmountRupees(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Invoice Date:</label>
                  <input
                    type="date"
                    className="form-input"
                    value={invoiceDate}
                    onChange={e => setInvoiceDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Expense Category:</label>
                <select className="form-select" value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="Water Infrastructure">Water Infrastructure</option>
                  <option value="Sanitation Equipment">Sanitation Equipment</option>
                  <option value="Engineering & Logistics">Engineering & Logistics</option>
                  <option value="Executive Travel & Luxury Transport">Executive Travel & Luxury Transport (Out-of-Scope Test)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Attach File (PDF, PNG, JPEG) or Generate Synthetic:</label>
                <input
                  type="file"
                  className="form-input"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={handleFileChange}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  If left blank, a deterministic synthetic PDF fixture will be generated and hashed.
                </span>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '8px' }}
                disabled={isProcessing}
              >
                {isProcessing ? 'Processing Evidence...' : 'Ingest, Compute SHA-256 & Commit'}
              </button>

              {isProcessing && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                    <span>{processingStage}</span>
                    <span className="tabular-nums">{progressPercent}%</span>
                  </div>
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Quick Duplicate Adversarial Test Trigger (Scenario 2 from Demo Runbook) */}
        <div className="data-card">
          <div className="card-header">
            <span className="card-title">Adversarial Re-use Test (Demo Scenario 2)</span>
            <span className="status-pill danger" style={{ fontSize: '10px' }}>RED-TEAM TRIGGER</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              In CASCADE PS 4.2 Theme 4, an adversarial NGO double-counts off-chain expenditure by submitting the same invoice (<span className="code-font">INV-1047</span>, ₹42,500) across two separate donor reports.
            </p>

            <div style={{ padding: '12px', backgroundColor: 'var(--bg-subtle)', borderRadius: '4px', fontSize: '12px' }}>
              <div><strong>Target Claim:</strong> GreenBuild Supplies INV-1047 (₹42,500)</div>
              <div><strong>Original Grant:</strong> CW-2026-014 (Northstar Fund)</div>
              <div><strong>Adversarial Re-use Target:</strong> CW-2026-015 (Global Horizon)</div>
            </div>

            <button
              className="btn btn-danger"
              onClick={() => {
                setVendorName('GreenBuild Supplies Ltd');
                setInvoiceNumber('INV-1047');
                setAmountRupees('42500');
                setInvoiceDate('2026-02-15');
                setSelectedGrantId('grant-cw-2026-015');
                setCategory('Water Infrastructure');
              }}
            >
              Load Duplicate Claim INV-1047 into Form
            </button>
            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
              Clicking above pre-fills the form with the identical invoice tuple under Grant CW-2026-015. Submitting it tests the automatic nullifier collision freeze.
            </span>
          </div>
        </div>
      </div>

      {/* Uploaded Documents Ledger */}
      <div className="data-card">
        <div className="card-header">
          <span className="card-title">Recorded Evidence Vault (Private Off-Chain Commitments)</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{state.documents.length} Files Indexed</span>
        </div>
        <div className="table-responsive">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Document File</th>
                <th>Claim ID</th>
                <th>Vendor / Inv</th>
                <th>Amount</th>
                <th>SHA-256 Digest</th>
                <th>Expense Nullifier</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.documents.map(doc => (
                <tr key={doc.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{doc.filename}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{(doc.sizeBytes / 1024).toFixed(1)} KB • {doc.mimeType}</div>
                  </td>
                  <td>
                    <span className="code-font">{doc.claimId}</span>
                  </td>
                  <td>
                    <div>{doc.extractedFields.vendorName}</div>
                    <div className="code-font" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{doc.extractedFields.invoiceNumber}</div>
                  </td>
                  <td className="tabular-nums" style={{ fontWeight: 600 }}>
                    ₹{(doc.extractedFields.totalAmountMinor / 100).toLocaleString()}
                  </td>
                  <td>
                    <span className="code-font" title={doc.sha256}>
                      {doc.sha256.substring(0, 14)}...
                    </span>
                  </td>
                  <td>
                    <span className="code-font" title={doc.expenseNullifierRef}>
                      {doc.expenseNullifierRef.substring(0, 14)}...
                    </span>
                  </td>
                  <td>
                    <span className={`status-pill ${doc.verificationStatus === 'SOURCE_ATTESTED' ? 'verified' : 'review'}`}>
                      {doc.verificationStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
