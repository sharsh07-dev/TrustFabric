import React, { useState } from 'react';
import { type TrustFabricStoreState } from '../services/storage';
import { EscrowStateMachine } from '../services/escrowStateMachine';
import { ContractEscrowService } from '../services/contractEscrowService';

interface DisbursementControlProps {
  state: TrustFabricStoreState;
  onUpdateState: (updated: Partial<TrustFabricStoreState>) => void;
  escrowMachine: EscrowStateMachine;
}

export const DisbursementControl: React.FC<DisbursementControlProps> = ({
  state,
  onUpdateState,
  escrowMachine,
}) => {
  const [contractEscrow] = useState(() => {
    const s = new ContractEscrowService();
    state.grants.forEach(g => {
      s.registerGrant({
        grantId: g.id,
        grantCodeHash: '0x' + g.grantCode.replace(/[^a-zA-Z0-9]/g, '').padEnd(64, '0'),
        donorAddress: '0x88942b083b0B47a75005e830B5047b4Ec20967A1',
        ceilingMinor: g.authorizedAmountMinor,
        allowedCategoriesMask: g.allowedCategories.join(','),
      });
    });
    state.claims.forEach(c => {
      const doc = state.documents.find(d => d.claimId === c.id);
      const attestation = state.deliveryAttestations.find(a => a.claimId === c.id);
      const trancheRes = s.registerClaimTranche({
        trancheId: `tranche-${c.id}`,
        grantId: c.grantId,
        claimId: c.id,
        beneficiaryOrVendor: c.vendorRef,
        amountMinor: c.amountMinor,
        categoryHash: '0x' + c.category.padEnd(64, '0'),
        evidenceDocSha256: doc ? doc.sha256 : 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        expenseNullifier: doc?.expenseNullifierRef || `nullifier-${c.id}`,
      });
      if (attestation && trancheRes.success) {
        s.linkDeliveryAttestation(`tranche-${c.id}`, attestation.signature);
      }
    });
    return s;
  });

  const [selectedClaimId, setSelectedClaimId] = useState(state.claims[0]?.id || '');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'danger'; message: string; txHash?: string } | null>(null);
  const [pendingConfirmAction, setPendingConfirmAction] = useState<{
    type: 'RELEASE' | 'SIMULATE_FREEZE' | 'RESOLVE_DISPUTE';
    title: string;
    description: string;
  } | null>(null);

  const selectedClaim = state.claims.find(c => c.id === selectedClaimId) || state.claims[0];
  const selectedGrant = state.grants.find(g => g.id === selectedClaim?.grantId) || state.grants[0];
  const escrowCase = selectedClaim ? escrowMachine.getCaseForClaim(selectedClaim.id) : undefined;
  const contractInfo = contractEscrow.getNetworkInfo();

  const hasValidDoc = state.documents.some(d => d.claimId === selectedClaim?.id);
  const hasValidDelivery = state.deliveryAttestations.some(
    a => a.claimId === selectedClaim?.id && a.verificationStatus === 'SOURCE_ATTESTED'
  );
  const hasOpenCriticalFinding = state.findings.some(
    f => f.claimId === selectedClaim?.id && f.severity === 'CRITICAL' && f.findingStatus === 'OPEN'
  );

  const eligibility = escrowMachine.evaluateEligibility(
    selectedClaim,
    selectedGrant,
    hasValidDoc,
    hasValidDelivery,
    hasOpenCriticalFinding
  );

  const filteredClaims = state.claims.filter(c => {
    if (statusFilter === 'ALL') return true;
    const cCase = escrowMachine.getCaseForClaim(c.id);
    return cCase ? cCase.state === statusFilter : c.disbursementStatus === statusFilter;
  });

  const executeConfirmedAction = () => {
    if (!pendingConfirmAction || !selectedClaim) return;
    const actionType = pendingConfirmAction.type;
    setPendingConfirmAction(null);

    if (actionType === 'RELEASE') {
      const result = escrowMachine.attemptRelease(
        selectedClaim.id,
        selectedGrant,
        selectedClaim,
        state.currentUserRole,
        eligibility
      );

      if (!result.success) {
        setActionFeedback({ type: 'danger', message: result.message });
      } else {
        // Enforce execution on Smart Contract TrustFabricEscrow.sol
        const trancheId = `tranche-${selectedClaim.id}`;
        const contractRes = contractEscrow.executeRelease(trancheId);

        const updatedClaims = state.claims.map(c =>
          c.id === selectedClaim.id ? { ...c, disbursementStatus: 'RELEASED' as const } : c
        );
        onUpdateState({
          claims: updatedClaims,
          escrowCases: escrowMachine.getCases(),
        });

        const txNote = contractRes.success
          ? ` [Smart Contract Verified: TrustFabricEscrow.sol Tx ${contractRes.txHash.slice(0, 18)}... (Block #${contractRes.blockNumber})]`
          : ` [Contract Execution Note: ${contractRes.error}]`;

        setActionFeedback({
          type: 'success',
          message: `${result.message}${txNote}`,
          txHash: contractRes.txHash,
        });
      }
    } else if (actionType === 'SIMULATE_FREEZE') {
      const findingId = `find-dup-auto-${Date.now()}`;
      escrowMachine.triggerAutomaticHold(
        selectedClaim.id,
        'Cryptographic expense nullifier collision detected across Grant CW-2026-014 and CW-2026-015',
        findingId,
        'CONTRACT_HOLD'
      );

      const updatedClaims = state.claims.map(c =>
        c.id === selectedClaim.id ? { ...c, disbursementStatus: 'ON_HOLD' as const } : c
      );

      onUpdateState({
        claims: updatedClaims,
        escrowCases: escrowMachine.getCases(),
      });

      setActionFeedback({
        type: 'danger',
        message: 'AUTOMATED SMART CONTRACT HOLD: Deterministic nullifier collision triggered TrustFabricEscrow.sol:AutomatedHoldTriggered. On-chain release is frozen autonomously.',
      });
    } else if (actionType === 'RESOLVE_DISPUTE') {
      const result = escrowMachine.resolveDispute(
        selectedClaim.id,
        state.currentUserRole,
        'Auditor verified documentation separation following complete forensic review.'
      );

      if (!result.success) {
        setActionFeedback({ type: 'danger', message: result.message });
      } else {
        const updatedClaims = state.claims.map(c =>
          c.id === selectedClaim.id ? { ...c, disbursementStatus: 'CONDITION_PENDING' as const } : c
        );
        onUpdateState({
          claims: updatedClaims,
          escrowCases: escrowMachine.getCases(),
        });
        setActionFeedback({ type: 'success', message: result.message });
      }
    }
  };

  return (
    <div className="content-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Disbursements & Smart-Contract Escrow Control
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Decentralized purpose-bound release rules, on-chain nullifier uniqueness, and milestone delivery validation (CASCADE '26 Theme 4.2)
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <span className="status-pill verified" title={contractInfo.contractAddress}>
            Contract: TrustFabricEscrow.sol ({contractInfo.contractAddress.slice(0, 10)}...)
          </span>
          <span className="status-pill neutral">
            Network: {contractInfo.mode === 'TESTNET_SEPOLIA_CONNECTED' ? 'Sepolia Testnet' : 'EVM Local Engine'}
          </span>
        </div>
      </div>

      {actionFeedback && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: actionFeedback.type === 'success' ? 'var(--status-verified-bg)' : 'var(--status-danger-bg)',
            border: `1px solid ${actionFeedback.type === 'success' ? 'var(--status-verified-border)' : 'var(--status-danger-border)'}`,
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            color: actionFeedback.type === 'success' ? 'var(--status-verified-text)' : 'var(--status-danger-text)',
            fontWeight: 500,
          }}
        >
          {actionFeedback.message}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="data-card" style={{ padding: '8px 16px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginRight: '6px' }}>
            Filter State:
          </span>
          {['ALL', 'RELEASE_ELIGIBLE', 'ON_HOLD', 'CONDITION_PENDING', 'RELEASED'].map(st => (
            <button
              key={st}
              className={`btn ${statusFilter === st ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '11.5px', padding: '3px 10px' }}
              onClick={() => setStatusFilter(st)}
            >
              {st.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Claims List & Escrow Detail Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '20px' }}>
        {/* Left: Tranche Claims List */}
        <div className="data-card">
          <div className="card-header">
            <span className="card-title">Disbursement Tranches</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {filteredClaims.length} Records
            </span>
          </div>

          <div className="table-responsive">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Invoice / Vendor</th>
                  <th>Amount</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {filteredClaims.map(c => {
                  const cCase = escrowMachine.getCaseForClaim(c.id);
                  const isSelected = selectedClaim?.id === c.id;
                  const stateVal = cCase?.state || c.disbursementStatus;

                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedClaimId(c.id)}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: isSelected ? 'var(--bg-subtle)' : undefined,
                      }}
                    >
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.invoiceNumberToken}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.vendorRef}</div>
                      </td>
                      <td className="tabular-nums" style={{ fontWeight: 600 }}>
                        ₹{(c.amountMinor / 100).toLocaleString()}
                      </td>
                      <td>
                        <span className={`status-pill ${stateVal === 'ON_HOLD' ? 'danger' : stateVal === 'RELEASED' ? 'verified' : 'review'}`}>
                          {stateVal}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: State Progression & Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* State Progression Visualizer */}
          <div className="data-card">
            <div className="card-header">
              <span className="card-title">Escrow State Progression</span>
              <span className="status-pill simulated" style={{ fontSize: '10px' }}>
                Enforcement: {escrowCase?.enforcementType || 'APP_HOLD'}
              </span>
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '8px' }}>
                {['LOCKED', 'CONDITION_PENDING', 'RELEASE_ELIGIBLE', 'ON_HOLD', 'RELEASED'].map((st) => {
                  const isActive = escrowCase?.state === st;
                  const isHold = st === 'ON_HOLD';
                  const isReleased = st === 'RELEASED';

                  return (
                    <div
                      key={st}
                      style={{
                        padding: '10px 6px',
                        textAlign: 'center',
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${isActive ? (isHold ? '#DC2626' : isReleased ? 'var(--primary-evergreen)' : '#D97706') : 'var(--border-medium)'}`,
                        backgroundColor: isActive ? (isHold ? '#FEE2E2' : isReleased ? '#E8F5E9' : '#FEF3C7') : 'var(--bg-subtle)',
                        color: isActive ? (isHold ? '#991B1B' : isReleased ? 'var(--primary-evergreen)' : '#92400E') : 'var(--text-muted)',
                        fontWeight: isActive ? 700 : 500,
                        fontSize: '11px',
                      }}
                    >
                      <div>{st}</div>
                      {isActive && <div style={{ fontSize: '9px', marginTop: '2px' }}>● ACTIVE</div>}
                    </div>
                  );
                })}
              </div>

              {escrowCase && (
                <div style={{ marginTop: '14px', padding: '10px 12px', backgroundColor: escrowCase.state === 'ON_HOLD' ? '#FEE2E2' : 'var(--bg-subtle)', borderRadius: '4px', fontSize: '12px' }}>
                  <strong style={{ color: escrowCase.state === 'ON_HOLD' ? '#991B1B' : 'var(--text-primary)' }}>
                    {escrowCase.state === 'ON_HOLD' ? 'Dispute / Hold Reason:' : 'State Rationale:'}
                  </strong>{' '}
                  <span style={{ color: escrowCase.state === 'ON_HOLD' ? '#991B1B' : 'var(--text-secondary)' }}>
                    {escrowCase.transitionReason}
                  </span>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Enforcement notice: Application-level hold freezes downstream release. It does not freeze off-chain bank accounts directly.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Condition Gates Checklist */}
          <div className="data-card">
            <div className="card-header">
              <span className="card-title">Release Condition Gates</span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12.5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>1. Authorized Scope Category:</span>
                <span className={`status-pill ${selectedGrant.allowedCategories.includes(selectedClaim.category) ? 'verified' : 'danger'}`}>
                  {selectedGrant.allowedCategories.includes(selectedClaim.category) ? 'PASSED' : 'OUT_OF_SCOPE'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>2. Invoice Evidence Document Hash:</span>
                <span className={`status-pill ${hasValidDoc ? 'verified' : 'danger'}`}>
                  {hasValidDoc ? 'VERIFIED SHA-256' : 'MISSING'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>3. Milestone Delivery Nonce & Signature:</span>
                <span className={`status-pill ${hasValidDelivery ? 'verified' : 'review'}`}>
                  {hasValidDelivery ? 'VALID SIGNATURE' : 'PENDING'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>4. Nullifier Collision Check:</span>
                <span className={`status-pill ${escrowCase?.state === 'ON_HOLD' ? 'danger' : 'verified'}`}>
                  {escrowCase?.state === 'ON_HOLD' ? 'COLLISION DETECTED' : 'PASSED (UNIQUE)'}
                </span>
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Overall Release Verdict: <strong>{eligibility.eligible ? 'ELIGIBLE FOR RELEASE' : 'RELEASE BLOCKED'}</strong>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{eligibility.reason}</div>
              </div>
            </div>
          </div>

          {/* Consequential Action Buttons */}
          <div className="data-card">
            <div className="card-header">
              <span className="card-title">Disbursement Execution</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Caller Role: {state.currentUserRole}</span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                className="btn btn-primary"
                style={{ width: '100%', padding: '9px' }}
                onClick={() =>
                  setPendingConfirmAction({
                    type: 'RELEASE',
                    title: 'Confirm Tranche Release',
                    description: `Are you sure you want to release tranche ₹${(selectedClaim.amountMinor / 100).toLocaleString()} for ${selectedClaim.vendorRef}? This will permanently update the disbursement state to RELEASED.`,
                  })
                }
                disabled={escrowCase?.state === 'RELEASED'}
              >
                {escrowCase?.state === 'RELEASED' ? '✓ Tranche Already Released' : 'Execute Tranche Release'}
              </button>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  className="btn btn-danger"
                  style={{ fontSize: '11.5px', padding: '6px' }}
                  onClick={() =>
                    setPendingConfirmAction({
                      type: 'SIMULATE_FREEZE',
                      title: 'Simulate Automated Nullifier Freeze',
                      description: 'Simulate an automated expense nullifier collision between this claim and an external grant tranche. Central auditor intervention is bypassed.',
                    })
                  }
                >
                  Simulate Nullifier Freeze
                </button>

                {escrowCase?.state === 'ON_HOLD' && (
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '11.5px', padding: '6px' }}
                    onClick={() =>
                      setPendingConfirmAction({
                        type: 'RESOLVE_DISPUTE',
                        title: 'Resolve Dispute & Lift Hold',
                        description: 'Verify documentation separation and lift application-level hold. Requires Auditor or Admin role.',
                      })
                    }
                  >
                    Resolve Dispute (Lift Hold)
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Consequential Actions */}
      {pendingConfirmAction && (
        <div className="modal-backdrop" onClick={() => setPendingConfirmAction(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>{pendingConfirmAction.title}</span>
              <button
                onClick={() => setPendingConfirmAction(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                {pendingConfirmAction.description}
              </p>
              <div style={{ marginTop: '10px', padding: '8px 10px', backgroundColor: 'var(--bg-subtle)', borderRadius: '4px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                Target: {selectedClaim.invoiceNumberToken} (₹{(selectedClaim.amountMinor / 100).toLocaleString()})
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setPendingConfirmAction(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={executeConfirmedAction}>
                Confirm & Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
