import { describe, it, expect, beforeEach } from 'vitest';
import { NgoVerificationService } from '../services/ngoVerificationService';

describe('TrustFabric Frontend NGO Verification & Gated Escrow Service', () => {
  let service: NgoVerificationService;

  beforeEach(() => {
    service = NgoVerificationService.getInstance();
  });

  describe('1. WebCrypto SHA-256 Hashing', () => {
    it('computes exact standard SHA-256 hash of text strings and document buffers', async () => {
      const hash1 = await service.computeFileSha256('TrustFabric_Test_Document_2026');
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);

      // Deterministic check
      const hash2 = await service.computeFileSha256('TrustFabric_Test_Document_2026');
      expect(hash1).toBe(hash2);
    });
  });

  describe('2. Scenario Integrity & Automated Defect Screening', () => {
    it('loads seed applications with correct initial states', async () => {
      const apps = await service.getApplications();
      expect(apps.length).toBeGreaterThanOrEqual(2);

      const verified = apps.find((a) => a.id === 'ngo-app-001');
      expect(verified?.verificationStatus).toBe('APPROVED');
      expect(verified?.automatedChecks.allMandatoryDocsPresent).toBe(true);

      const flawed = apps.find((a) => a.id === 'ngo-app-002');
      expect(flawed?.verificationStatus).toBe('FLAGGED_DEFECTS');
      expect(flawed?.automatedChecks.duplicateBankCollision).toBe(true);
    });

    it('attaches uploaded document and recalculates mandatory checklist', async () => {
      const dummySha = await service.computeFileSha256('Dummy NITI Aayog Darpan Certificate Content');
      const updated = await service.uploadDocument('ngo-app-002', {
        type: 'NGO_DARPAN_REGISTRATION',
        name: 'Darpan_Registration_Proof.pdf',
        fileSha256: dummySha,
        reviewStatus: 'VERIFIED',
      });

      expect(updated.documents['NGO_DARPAN_REGISTRATION']).toBeDefined();
      expect(updated.documents['NGO_DARPAN_REGISTRATION'].fileSha256).toBe(dummySha);
    });
  });

  describe('3. Role Permissions & Review Decisions', () => {
    it('prevents approving an application with duplicate bank collisions', async () => {
      const reviewResult = await service.submitReview('ngo-app-002', {
        decision: 'APPROVED',
        reviewer: 'Meera (NGO Lead)',
        reviewerRole: 'ADMIN',
        notes: 'Attempting invalid approval with known bank collision',
      });

      expect(reviewResult.success).toBe(false);
      expect(reviewResult.error).toMatch(/(defects or collisions|duplicate bank collisions)/);
    });

    it('allows valid approval on compliant application', async () => {
      const reviewResult = await service.submitReview('ngo-app-001', {
        decision: 'APPROVED',
        reviewer: 'Meera (NGO Lead)',
        reviewerRole: 'ADMIN',
        notes: 'Compliant verification attested',
      });

      expect(reviewResult.success).toBe(true);
      expect(reviewResult.application.verificationStatus).toBe('APPROVED');
    });
  });

  describe('4. Gated Escrow Funding Release Enforcement', () => {
    it('strictly blocks escrow release on unapproved or flawed application', async () => {
      const releaseResult = await service.authorizeEscrowRelease('ngo-app-002', {
        role: 'ADMIN',
        name: 'Finance Lead',
      });

      expect(releaseResult.success).toBe(false);
      expect(releaseResult.blockingReasons).toBeDefined();
      expect(releaseResult.blockingReasons!.length).toBeGreaterThan(0);
      expect(releaseResult.application.escrowAuthorization.isAuthorized).toBe(false);
    });

    it('authorizes smart contract release on fully verified application', async () => {
      const releaseResult = await service.authorizeEscrowRelease('ngo-app-001', {
        role: 'ADMIN',
        name: 'Finance Lead',
      });

      expect(releaseResult.success).toBe(true);
      expect(releaseResult.application.escrowAuthorization.isAuthorized).toBe(true);
      expect(releaseResult.application.escrowAuthorization.blockchainStatus).toBe('ESCROW_RELEASED');
      expect(releaseResult.application.escrowAuthorization.blockchainTxHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(releaseResult.application.escrowAuthorization.onChainAnchorHash).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });
});
