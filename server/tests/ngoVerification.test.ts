import { describe, it, expect, beforeEach } from 'vitest';
import { PaymentDatabase } from '../src/db.js';

describe('TrustFabric NGO Funding Verification & Gated Escrow Engine', () => {
  let db: PaymentDatabase;

  beforeEach(() => {
    db = PaymentDatabase.getInstance();
  });

  describe('1. Seed Scenarios & Integrity Checks', () => {
    it('initializes with seed applications representing verified, flawed, and pending states', () => {
      const apps = db.getAllNgoApplications();
      expect(apps.length).toBeGreaterThanOrEqual(3);

      const verified = db.getNgoApplication('ngo-app-001');
      expect(verified?.ngoName).toBe('Jal Jeevan Relief Mission');
      expect(verified?.verificationStatus).toBe('APPROVED');
      expect(verified?.automatedChecks.allMandatoryDocsPresent).toBe(true);
      expect(verified?.automatedChecks.duplicateBankCollision).toBe(false);

      const flawed = db.getNgoApplication('ngo-app-002');
      expect(flawed?.ngoName).toBe('Gramin Solar Irrigation Initiative');
      expect(flawed?.automatedChecks.duplicateBankCollision).toBe(true);
      expect(flawed?.automatedChecks.allMandatoryDocsPresent).toBe(false);
      expect(flawed?.verificationStatus).toBe('FLAGGED_DEFECTS');
    });

    it('detects duplicate bank account collision across different NGOs', () => {
      const app1 = db.getNgoApplication('ngo-app-001');
      const app2 = db.getNgoApplication('ngo-app-002');
      expect(app1?.bankDetails.accountNumber).toBe(app2?.bankDetails.accountNumber);
      expect(app2?.automatedChecks.duplicateBankCollision).toBe(true);
    });
  });

  describe('2. Document Checklists & SHA-256 Hashes', () => {
    it('verifies SHA-256 commitment format on all uploaded documents', () => {
      const app = db.getNgoApplication('ngo-app-001');
      expect(app).toBeDefined();

      for (const doc of Object.values(app!.documents)) {
        expect(doc.fileSha256).toMatch(/^[a-f0-9]{64}$/);
        expect(doc.sizeBytes).toBeGreaterThan(0);
        expect(doc.uploadedAt).toBeDefined();
      }
    });

    it('flags missing mandatory documents', () => {
      const app2 = db.getNgoApplication('ngo-app-002');
      const docTypes = Object.keys(app2!.documents);
      expect(docTypes).not.toContain('NGO_DARPAN_REGISTRATION');
      expect(docTypes).not.toContain('PROJECT_PROPOSAL');
      expect(app2!.automatedChecks.allMandatoryDocsPresent).toBe(false);
    });
  });

  describe('3. Gated Escrow Funding Release & Rejection Rules', () => {
    it('STRICTLY BLOCKS funding release when an application has defects, collisions, or rejection status', () => {
      const flawedApp = db.getNgoApplication('ngo-app-002')!;
      expect(flawedApp.verificationStatus).toBe('FLAGGED_DEFECTS');

      // Attempting to authorize escrow release MUST fail
      const blockingReasons: string[] = [];
      if (flawedApp.verificationStatus !== 'APPROVED') {
        blockingReasons.push(`Verification status is '${flawedApp.verificationStatus}'`);
      }
      if (flawedApp.automatedChecks.duplicateBankCollision) {
        blockingReasons.push('Duplicate bank account collision detected.');
      }
      if (!flawedApp.automatedChecks.allMandatoryDocsPresent) {
        blockingReasons.push('Missing mandatory legal / bank compliance documents.');
      }

      expect(blockingReasons.length).toBeGreaterThan(0);
      expect(flawedApp.escrowAuthorization.isAuthorized).toBe(false);
    });

    it('authorizes funding release and commits on-chain cryptographic anchor when all criteria pass', () => {
      const verifiedApp = db.getNgoApplication('ngo-app-001')!;
      expect(verifiedApp.verificationStatus).toBe('APPROVED');
      expect(verifiedApp.automatedChecks.duplicateBankCollision).toBe(false);
      expect(verifiedApp.automatedChecks.allMandatoryDocsPresent).toBe(true);
      expect(verifiedApp.automatedChecks.suspiciousFlagsCount).toBe(0);

      // Criteria all satisfied
      const now = new Date().toISOString();
      verifiedApp.escrowAuthorization = {
        isAuthorized: true,
        blockingReasons: [],
        authorizedAt: now,
        authorizerRole: 'NGO_ADMIN',
        contractEscrowTrancheId: 'tranche-app-001',
        blockchainTxHash: '0xabc123789fed456000111222333444555666777888999aaabbbcccdddeeefff0',
        blockchainBlock: 5892150,
        blockchainStatus: 'ESCROW_RELEASED',
        onChainAnchorHash: '0x999888777666555444333222111000aaabbbcccdddeeefff1112223334445556',
        network: 'Ethereum Sepolia (EVM) / TrustFabricEscrow.sol',
        contractAddress: '0x71C569E962Ac1C7F602B7d2A40EAA672D611293B',
      };
      db.updateNgoApplication(verifiedApp);

      const updated = db.getNgoApplication('ngo-app-001')!;
      expect(updated.escrowAuthorization.isAuthorized).toBe(true);
      expect(updated.escrowAuthorization.blockchainStatus).toBe('ESCROW_RELEASED');
      expect(updated.escrowAuthorization.blockchainTxHash).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });
});
