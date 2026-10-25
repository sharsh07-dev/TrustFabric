import { describe, it, expect, beforeEach } from 'vitest';
import { DeliveryProofService, type CanonicalDeliveryPayload } from '../services/deliveryProof';
import { sha256Hex, signCanonicalStatement } from '../services/crypto';
import { type DeliveryAttestation } from '../types/trustfabric';

describe('TrustFabric Privacy, Delivery Attestation & Access Control (P0)', () => {
  let proofService: DeliveryProofService;
  const signerKeyId = 'SIGNER_FIELD_OFFICER_01';

  beforeEach(() => {
    proofService = new DeliveryProofService();
  });

  it('verifies a valid delivery attestation with opaque beneficiary reference', async () => {
    const payload: CanonicalDeliveryPayload = {
      milestoneId: 'milestone-borehole-01',
      claimId: 'claim-borehole-101',
      completionStatement: 'Hydrogeological borehole drilling completed to 140m depth at Gov School #4.',
      recipientOpaqueRef: await sha256Hex('BENEFICIARY:SALT_9921_SCHOOL_HEADMASTER_PATEL'), // PII is salted and masked
      evidenceCommitment: '0xabc123evidencehash',
      timestamp: '2026-02-18T10:00:00Z',
      nonce: 'nonce-unique-2026-001',
    };

    const canonicalStmt = DeliveryProofService.serializeCanonicalClaim(payload);
    const commitment = await sha256Hex(canonicalStmt);
    const signResult = await signCanonicalStatement(canonicalStmt, payload.nonce, signerKeyId);

    const attestation: DeliveryAttestation = {
      id: 'attest-001',
      claimId: payload.claimId,
      milestoneId: payload.milestoneId,
      canonicalStatementCommitment: commitment,
      signerCredentialRef: signerKeyId,
      signature: signResult.signature,
      nonce: payload.nonce,
      issuedAt: payload.timestamp,
      proofRef: 'PHOTO_METADATA_GPS_LAT_28.61_LONG_77.20',
      verificationStatus: 'SOURCE_ATTESTED',
    };

    const result = await proofService.verifyAttestation(attestation, payload);
    expect(result.isValid).toBe(true);
    expect(result.verificationStatus).toBe('SOURCE_ATTESTED');
    expect(result.reason).toContain('Signed by');
    expect(result.trustModelExplanation).toContain('WHAT IS PROVEN');
  });

  it('rejects replay attacks when an identical nonce is reused on a second claim (AT-EVID-07)', async () => {
    const payload: CanonicalDeliveryPayload = {
      milestoneId: 'milestone-01',
      claimId: 'claim-001',
      completionStatement: 'Completion verified.',
      recipientOpaqueRef: 'opaque-ref-1',
      evidenceCommitment: '0xdoc',
      timestamp: '2026-02-18T10:00:00Z',
      nonce: 'nonce-reused-target-99',
    };

    const canonical = DeliveryProofService.serializeCanonicalClaim(payload);
    const commitment = await sha256Hex(canonical);
    const signResult = await signCanonicalStatement(canonical, payload.nonce, signerKeyId);

    const attestation: DeliveryAttestation = {
      id: 'attest-01',
      claimId: 'claim-001',
      milestoneId: 'milestone-01',
      canonicalStatementCommitment: commitment,
      signerCredentialRef: signerKeyId,
      signature: signResult.signature,
      nonce: payload.nonce,
      issuedAt: payload.timestamp,
      proofRef: 'proof-ref',
      verificationStatus: 'SOURCE_ATTESTED',
    };

    // First verification succeeds
    const res1 = await proofService.verifyAttestation(attestation, payload);
    expect(res1.isValid).toBe(true);

    // Replay attempt on second claim using same nonce MUST fail
    const replayPayload: CanonicalDeliveryPayload = {
      ...payload,
      claimId: 'claim-002-adversary',
    };
    const res2 = await proofService.verifyAttestation(attestation, replayPayload);
    expect(res2.isValid).toBe(false);
    expect(res2.reason).toContain('REPLAY ATTACK DETECTED');
  });

  it('rejects tampered delivery statements when payload is modified after signing', async () => {
    const payload: CanonicalDeliveryPayload = {
      milestoneId: 'milestone-01',
      claimId: 'claim-001',
      completionStatement: 'Original Statement: 50 water filters delivered.',
      recipientOpaqueRef: 'opaque-ref-1',
      evidenceCommitment: '0xdoc',
      timestamp: '2026-02-18T10:00:00Z',
      nonce: 'nonce-tamper-test-1',
    };

    const canonical = DeliveryProofService.serializeCanonicalClaim(payload);
    const commitment = await sha256Hex(canonical);
    const signResult = await signCanonicalStatement(canonical, payload.nonce, signerKeyId);

    const attestation: DeliveryAttestation = {
      id: 'attest-01',
      claimId: 'claim-001',
      milestoneId: 'milestone-01',
      canonicalStatementCommitment: commitment,
      signerCredentialRef: signerKeyId,
      signature: signResult.signature,
      nonce: payload.nonce,
      issuedAt: payload.timestamp,
      proofRef: 'proof-ref',
      verificationStatus: 'SOURCE_ATTESTED',
    };

    // Adversary modifies statement text
    const tamperedPayload: CanonicalDeliveryPayload = {
      ...payload,
      completionStatement: 'Altered Statement: 5 filters delivered, 45 diverted.',
    };

    const result = await proofService.verifyAttestation(attestation, tamperedPayload);
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('CANONICAL COMMITMENT MISMATCH');
  });

  it('rejects invalid or corrupted cryptographic signatures', async () => {
    const payload: CanonicalDeliveryPayload = {
      milestoneId: 'milestone-01',
      claimId: 'claim-001',
      completionStatement: 'Completion verified.',
      recipientOpaqueRef: 'opaque-ref-1',
      evidenceCommitment: '0xdoc',
      timestamp: '2026-02-18T10:00:00Z',
      nonce: 'nonce-corrupt-sig-test',
    };

    const canonical = DeliveryProofService.serializeCanonicalClaim(payload);
    const commitment = await sha256Hex(canonical);

    const attestation: DeliveryAttestation = {
      id: 'attest-01',
      claimId: 'claim-001',
      milestoneId: 'milestone-01',
      canonicalStatementCommitment: commitment,
      signerCredentialRef: signerKeyId,
      signature: '0xdeadbeef_corrupted_signature_bytes_1234567890',
      nonce: payload.nonce,
      issuedAt: payload.timestamp,
      proofRef: 'proof-ref',
      verificationStatus: 'SOURCE_ATTESTED',
    };

    const result = await proofService.verifyAttestation(attestation, payload);
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('SIGNATURE FAILED');
  });
});
