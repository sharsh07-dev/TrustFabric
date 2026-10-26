import React, { useState, useEffect, useRef } from 'react';
import {
  Web3DonationService,
  type VerifiedTransactionAudit,
  type LiveTrackerStage,
  SEPOLIA_CHAIN_ID,
  SEPOLIA_CONTRACT_ADDRESS,
} from '../services/web3DonationService';

interface OnChainTransactionTrackerProps {
  initialTxHash?: string | null;
  onClose?: () => void;
  standalone?: boolean;
}

const STAGE_LABELS: Record<LiveTrackerStage, { label: string; icon: string; color: string }> = {
  READY_TO_DONATE: { label: 'Ready to Donate', icon: '⚡', color: '#64748b' },
  WALLET_AWAITING_APPROVAL: { label: 'Awaiting Signature', icon: '✍️', color: '#eab308' },
  TX_SUBMITTED: { label: 'Transaction Submitted', icon: '🚀', color: '#3b82f6' },
  PENDING_SEPOLIA: { label: 'Pending on Sepolia', icon: '⏳', color: '#f59e0b' },
  TX_MINED: { label: 'Block Mined', icon: '⛏️', color: '#8b5cf6' },
  RECEIPT_VERIFICATION: { label: 'Verifying Receipt & Logs', icon: '🔍', color: '#06b6d4' },
  CONFIRMATIONS_REACHED: { label: 'Confirmations Progress', icon: '📦', color: '#10b981' },
  CONFIRMED_DONATION: { label: 'Donation Confirmed', icon: '✅', color: '#22c55e' },
  FAILED_OR_REVERTED: { label: 'Transaction Reverted', icon: '❌', color: '#ef4444' },
  STATUS_UNAVAILABLE: { label: 'RPC Re-querying', icon: '⚠️', color: '#f97316' },
  RECHECKING: { label: 'Rechecking Consensus', icon: '🔄', color: '#0ea5e9' },
};

export const OnChainTransactionTracker: React.FC<OnChainTransactionTrackerProps> = ({
  initialTxHash,
  onClose,
  standalone = false,
}) => {
  const [web3Service] = useState(() => Web3DonationService.getInstance());
  const [activeTxHash, setActiveTxHash] = useState<string>(() => {
    if (initialTxHash) return initialTxHash;
    return localStorage.getItem('trustfabric_active_tracking_tx') || '';
  });
  const [customHashInput, setCustomHashInput] = useState<string>('');
  const [auditResult, setAuditResult] = useState<VerifiedTransactionAudit | null>(null);
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Sync initialTxHash if changed from parent
  useEffect(() => {
    if (initialTxHash && initialTxHash !== activeTxHash) {
      setActiveTxHash(initialTxHash);
    }
  }, [initialTxHash]);

  // Start live monitoring whenever activeTxHash changes
  useEffect(() => {
    if (!activeTxHash || !activeTxHash.startsWith('0x') || activeTxHash.length !== 66) {
      return;
    }

    localStorage.setItem('trustfabric_active_tracking_tx', activeTxHash);
    setIsTracking(true);
    setErrorMessage(null);

    web3Service
      .trackTransaction(activeTxHash as any, (update) => {
        if (isMountedRef.current) {
          setAuditResult(update);
        }
      })
      .then((finalAudit) => {
        if (isMountedRef.current) {
          setAuditResult(finalAudit);
          setIsTracking(false);
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          setErrorMessage(err.message || 'Tracking error from Sepolia RPC.');
          setIsTracking(false);
        }
      });
  }, [activeTxHash, web3Service]);

  const handleManualVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customHashInput.trim();
    if (!clean || !clean.startsWith('0x') || clean.length !== 66) {
      setErrorMessage('Please enter a valid 66-character Ethereum transaction hash (starting with 0x).');
      return;
    }

    setErrorMessage(null);
    setIsTracking(true);
    setActiveTxHash(clean);

    try {
      const res = await web3Service.verifyExternalTransaction(clean);
      if (isMountedRef.current) {
        setAuditResult(res);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setErrorMessage(err.message || 'Verification failed. Could not query transaction from Sepolia.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsTracking(false);
      }
    }
  };

  const handleClear = () => {
    setActiveTxHash('');
    setAuditResult(null);
    setErrorMessage(null);
    localStorage.removeItem('trustfabric_active_tracking_tx');
  };

  const stageMeta = auditResult ? STAGE_LABELS[auditResult.stage] : STAGE_LABELS.READY_TO_DONATE;

  return (
    <div style={{
      background: 'var(--bg-card, #1e293b)',
      border: '1px solid var(--border-color, #334155)',
      borderRadius: '12px',
      padding: '24px',
      color: '#f8fafc',
      marginTop: standalone ? '0' : '24px',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #334155', paddingBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>📡</span>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
              Live On-Chain Transaction Tracker & Independent Verifier
            </h3>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Real-time Ethereum Sepolia consensus monitoring with direct event log decoding. Zero backend trust.
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: '#334155',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            ✕ Close
          </button>
        )}
      </div>

      {/* Standalone Hash Verifier Input */}
      <form onSubmit={handleManualVerify} style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '8px' }}>
          Verify Any Sepolia Transaction Hash (Independent Auditor Tool):
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={customHashInput}
            onChange={(e) => setCustomHashInput(e.target.value)}
            placeholder="0x... (Paste any Sepolia transaction hash)"
            style={{
              flex: 1,
              background: '#0f172a',
              border: '1px solid #475569',
              borderRadius: '8px',
              padding: '10px 14px',
              color: '#f8fafc',
              fontSize: '13px',
              fontFamily: 'monospace',
            }}
          />
          <button
            type="submit"
            disabled={isTracking}
            style={{
              background: isTracking ? '#475569' : '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: isTracking ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isTracking ? 'Verifying...' : '🔍 Verify On-Chain'}
          </button>
          {activeTxHash && (
            <button
              type="button"
              onClick={handleClear}
              style={{
                background: '#334155',
                color: '#cbd5e1',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {errorMessage && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid #ef4444',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '20px',
          fontSize: '13px',
          color: '#fca5a5',
        }}>
          ⚠️ {errorMessage}
        </div>
      )}

      {/* Progress Stepper */}
      {auditResult && (
        <div>
          <div style={{
            background: '#0f172a',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '20px',
            border: `1px solid ${stageMeta.color}44`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>{stageMeta.icon}</span>
                <div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: stageMeta.color,
                  }}>
                    Current Stage
                  </span>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>
                    {stageMeta.label}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{
                  display: 'inline-block',
                  background: auditResult.stage === 'CONFIRMED_DONATION' ? '#166534' : '#1e3a8a',
                  color: auditResult.stage === 'CONFIRMED_DONATION' ? '#86efac' : '#93c5fd',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 700,
                }}>
                  {auditResult.confirmationsReached} / {auditResult.confirmationsRequired} Confirmations
                </span>
              </div>
            </div>

            <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5 }}>
              {auditResult.stageDescription}
            </p>
          </div>

          {/* Detailed Verified Audit Card */}
          <div style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '20px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                Verified Cryptographic Evidence
              </span>
              <a
                href={auditResult.explorerUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  color: '#60a5fa',
                  fontSize: '12px',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                View on Sepolia Etherscan ↗
              </a>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Transaction Hash</span>
                <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#f8fafc', wordBreak: 'break-all' }}>
                  {auditResult.txHash}
                </span>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Network & Chain ID</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                  {auditResult.networkName} ({auditResult.chainId})
                </span>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Block Inclusion</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: auditResult.blockNumber ? '#f8fafc' : '#94a3b8' }}>
                  {auditResult.blockNumber ? `#${auditResult.blockNumber}` : 'Pending Mining'}
                </span>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Donation Amount</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#22c55e' }}>
                  {auditResult.donationAmountEth ? `${auditResult.donationAmountEth} ETH` : 'Scanning Value...'}
                </span>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Donor Address</span>
                <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#cbd5e1' }}>
                  {auditResult.senderAddress || 'Scanning...'}
                </span>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Target Contract Address</span>
                <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#cbd5e1' }}>
                  {auditResult.contractAddress}
                </span>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Campaign Identifier</span>
                <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#cbd5e1' }}>
                  {auditResult.campaignId || 'CW-2026-014'}
                </span>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>NGO Recipient Wallet</span>
                <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#cbd5e1' }}>
                  {auditResult.recipientAddress || '0x92B34c67D2B1cE09874a12D3A6F1959728864f71'}
                </span>
              </div>

              {auditResult.gasUsed && (
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Gas Consumed</span>
                  <span style={{ fontSize: '12px', color: '#cbd5e1' }}>
                    {auditResult.gasUsed} gas {auditResult.effectiveGasPriceGwei && `(${auditResult.effectiveGasPriceGwei} Gwei)`}
                  </span>
                </div>
              )}

              {auditResult.blockTimestamp && (
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Block Timestamp</span>
                  <span style={{ fontSize: '12px', color: '#cbd5e1' }}>
                    {new Date(auditResult.blockTimestamp).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* Event Verification Badge */}
            <div style={{
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid #1e293b',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>{auditResult.eventVerified ? '📜' : '⏳'}</span>
                <span style={{ fontSize: '12px', color: '#cbd5e1' }}>
                  Contract Event: <strong>DonationReceived(address,bytes32,address,uint256)</strong>{' '}
                  {auditResult.eventVerified ? (
                    <span style={{ color: '#4ade80', fontWeight: 700 }}>[MATCHED & DECODED]</span>
                  ) : (
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>[PENDING DECODE]</span>
                  )}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>🌳</span>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Merkle Batch Status:{' '}
                  <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
                    {auditResult.merkleBatchStatus === 'PENDING_NEXT_BATCH'
                      ? 'Queued for Next Anchor Batch'
                      : 'Anchored in Merkle Root'}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
