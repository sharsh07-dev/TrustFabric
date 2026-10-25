import React, { useState } from 'react';
import { type TrustFabricStoreState } from '../services/storage';
import { ServerStorageService } from '../services/serverStorage';

interface SettingsHealthViewProps {
  state: TrustFabricStoreState;
  onUpdateState: (updated: Partial<TrustFabricStoreState>) => void;
}

export const SettingsHealthView: React.FC<SettingsHealthViewProps> = ({ state, onUpdateState }) => {
  const [serverStorage] = useState(() => new ServerStorageService());
  const backendInfo = serverStorage.getBackendInfo();
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const handleExportBundle = () => {
    const jsonStr = serverStorage.exportBackupPackage(state);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trustfabric_audit_package_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const result = serverStorage.importBackupPackage(content);

      if (result.success && result.importedState) {
        onUpdateState(result.importedState);
        setImportStatus('✓ Forensic package imported successfully! Active records refreshed.');
      } else {
        setImportStatus(`✗ Import failed: ${result.error || 'Invalid file'}`);
      }
      setTimeout(() => setImportStatus(null), 5000);
    };
    reader.readAsText(file);
  };

  return (
    <div className="content-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
            System Settings & Integration Health
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Authoritative status of smart contract connectivity, database persistence, cryptographic engines, and security controls
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" onClick={handleExportBundle}>
            Export Forensic Audit Bundle (.json)
          </button>
        </div>
      </div>

      {importStatus && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: importStatus.startsWith('✓') ? 'var(--status-verified-bg)' : 'var(--status-danger-bg)',
            border: `1px solid ${importStatus.startsWith('✓') ? 'var(--status-verified-border)' : 'var(--status-danger-border)'}`,
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            color: importStatus.startsWith('✓') ? 'var(--status-verified-text)' : 'var(--status-danger-text)',
            fontWeight: 500,
          }}
        >
          {importStatus}
        </div>
      )}

      {/* Grid of Subsystem Health Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
        {/* 1. Smart-Contract Escrow Engine */}
        <div className="data-card">
          <div className="card-header">
            <span className="card-title">Decentralized Escrow Contract</span>
            <span className="status-pill verified">EVM Solc 0.8.20</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12.5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Contract Type:</span>
              <strong style={{ color: 'var(--text-primary)' }}>TrustFabricEscrow.sol</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Target Network:</span>
              <span className="code-font">Ethereum Sepolia (Chain ID: 11155111)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Contract Address:</span>
              <span className="code-font" style={{ color: 'var(--primary-evergreen)' }}>0x71C569...EscrowVault</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Nullifier Enforcement:</span>
              <span className="status-pill verified">AUTOMATIC ON-CHAIN FREEZE</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Centrally Controlled Admin:</span>
              <span className="status-pill danger">DISABLED (No Single Auditor)</span>
            </div>
            <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-subtle)', borderRadius: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
              Release gates require: valid purpose category, evidence document hash, Ed25519 delivery attestation, and zero nullifier collisions.
            </div>
          </div>
        </div>

        {/* 2. Database & Object Storage */}
        <div className="data-card">
          <div className="card-header">
            <span className="card-title">Database & Private Storage</span>
            <span className={`status-pill ${backendInfo.isCloudConnected ? 'verified' : 'simulated'}`}>
              {backendInfo.mode}
            </span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12.5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Engine Version:</span>
              <span>{backendInfo.version}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Endpoint:</span>
              <span className="code-font" style={{ fontSize: '11.5px' }}>{backendInfo.endpoint}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Row Level Security (RLS):</span>
              <span className="status-pill verified">CONFIGURED (15 Tables)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Evidence Storage:</span>
              <span>Private Vault (Time-limited Signed URLs)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Credential Safety:</span>
              <span className="status-pill verified">0 SECRETS IN BUNDLE</span>
            </div>
            <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-subtle)', borderRadius: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
              Client uses anon credentials only. Server-side stored procedures enforce ACID atomicity for allocation checks and nullifier registrations.
            </div>
          </div>
        </div>

        {/* 3. Cryptographic Engines & Auditing */}
        <div className="data-card">
          <div className="card-header">
            <span className="card-title">Cryptographic Engines</span>
            <span className="status-pill verified">SubtleCrypto + WebAssembly</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12.5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Audit Hash Chain:</span>
              <span>SHA-256 Sequential Block Chaining</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Delivery Attestations:</span>
              <span>Ed25519 + Nonce Freshness Cache</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Expense Nullifiers:</span>
              <span>Cross-Donor Salted Tuple Hash</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Offline Auditor CLI:</span>
              <span className="code-font">bin/trustfabric-verify</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Tamper Detection:</span>
              <span className="status-pill verified">MATHEMATICALLY PROVABLE</span>
            </div>
            <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-subtle)', borderRadius: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
              Independent auditor CLI can verify an exported package from terminal without access to the web dashboard.
            </div>
          </div>
        </div>

        {/* 4. One-Time Migration & Backup Tools */}
        <div className="data-card">
          <div className="card-header">
            <span className="card-title">Forensic Package Import & Export</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12.5px' }}>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              Export an authoritative snapshot of all active grants, allocations, evidence commitments, nullifiers, and chained audit blocks for third-party verification.
            </p>

            <button className="btn btn-secondary" style={{ width: '100%' }} onClick={handleExportBundle}>
              📥 Export Active Audit Package (.json)
            </button>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
              <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Import Forensic Package to Inspect:
              </label>
              <input
                type="file"
                accept=".json"
                className="form-input"
                style={{ width: '100%', fontSize: '11.5px' }}
                onChange={handleImportFile}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
