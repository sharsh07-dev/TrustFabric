import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { ethers } from 'ethers';
import { EvidenceEncryptionService } from '../src/services/evidenceEncryptionService.js';
import { ChainIndexerService } from '../src/services/chainIndexerService.js';
import { TRUST_FABRIC_ABI } from '../src/services/contractAbi.js';

describe('Decentralized Evidence Encryption & Reconstructable Indexing Suite', () => {
  let encryptionService: EvidenceEncryptionService;
  let indexerService: ChainIndexerService;

  beforeEach(() => {
    encryptionService = EvidenceEncryptionService.getInstance();
    indexerService = ChainIndexerService.getInstance();
  });

  describe('1. Evidence Envelope Encryption (AES-256-GCM)', () => {
    it('encrypts raw invoice buffer and generates tamper-resistant envelope', () => {
      const sampleInvoice = Buffer.from(
        'INVOICE #9981 - Vendor: GreenBuild Supplies - GSTIN: 27AABCT3518Q1ZP - Total: ₹45,000 - PAN: ABCDE1234F',
        'utf8'
      );
      const originalSha256 = crypto.createHash('sha256').update(sampleInvoice).digest('hex');

      const { envelope, serializedPayload } = encryptionService.encryptDocument(
        sampleInvoice,
        'text/plain'
      );

      // Verify envelope properties
      expect(envelope.formatVersion).toBe('trustfabric-envelope-v1');
      expect(envelope.algorithm).toBe('AES-256-GCM');
      expect(envelope.originalSha256).toBe(originalSha256);
      expect(envelope.ivHex.length).toBe(24); // 12 bytes hex
      expect(envelope.authTagHex.length).toBe(32); // 16 bytes hex
      expect(envelope.ciphertextBase64).toBeDefined();

      // Ensure ciphertext does NOT contain plaintext PII (PAN / GSTIN)
      const rawEncryptedStr = serializedPayload.toString('utf8');
      expect(rawEncryptedStr).not.toContain('ABCDE1234F');
      expect(rawEncryptedStr).not.toContain('27AABCT3518Q1ZP');
      expect(rawEncryptedStr).not.toContain('GreenBuild Supplies');
    });

    it('decrypts envelope and verifies cryptographic integrity against original commitment', () => {
      const sensitiveData = Buffer.from('Confidential Bank Account: 1234567890 IFSC: HDFC0001234', 'utf8');
      const { envelope } = encryptionService.encryptDocument(sensitiveData, 'text/plain');

      const decrypted = encryptionService.decryptDocument(envelope);
      expect(decrypted.sha256Matched).toBe(true);
      expect(decrypted.plaintext.toString('utf8')).toBe('Confidential Bank Account: 1234567890 IFSC: HDFC0001234');
    });

    it('rejects tampered ciphertext with cryptographic authentication tag failure', () => {
      const rawData = Buffer.from('Sensitive government proposal grant allocation document', 'utf8');
      const { envelope } = encryptionService.encryptDocument(rawData, 'application/pdf');

      // Tamper with ciphertext by flipping bits in the base64 string
      const tamperedBuf = Buffer.from(envelope.ciphertextBase64, 'base64');
      tamperedBuf[0] ^= 0xff; // flip byte
      envelope.ciphertextBase64 = tamperedBuf.toString('base64');

      expect(() => {
        encryptionService.decryptDocument(envelope);
      }).toThrow();
    });
  });

  describe('2. Independent Blockchain Receipt Verification & Index Reconstruction', () => {
    it('rejects unmined or missing transaction hashes cleanly', async () => {
      const mockProvider = {
        getTransactionReceipt: async () => null,
      } as unknown as ethers.Provider;
      indexerService.setProvider(mockProvider);

      const fakeTxHash = '0x' + '11'.repeat(32);
      const result = await indexerService.verifyDonationReceipt(
        fakeTxHash,
        '0x5FbDB2315678afecb367f032d93F642f64180aa3',
        11155111,
        1
      );

      expect(result.verified).toBe(false);
      expect(['PENDING', 'NOT_FOUND']).toContain(result.status);
    });

    it('reconstructs state and aggregates campaign totals correctly from event stream', async () => {
      // Simulate mock provider that yields DonationReceived logs
      const contractAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
      const campaignId = '0x' + '22'.repeat(32);
      const donor = '0x' + '33'.repeat(20);
      const recipient = '0x' + '44'.repeat(20);
      const donationWei = ethers.parseEther('1.5');

      const iface = new ethers.Interface(TRUST_FABRIC_ABI);
      const donationLog = iface.encodeEventLog(
        iface.getEvent('DonationReceived')!,
        [donor, campaignId, recipient, donationWei, 1700000000n, 100n]
      );

      const mockLogs = [
        {
          address: contractAddress,
          topics: donationLog.topics,
          data: donationLog.data,
          blockNumber: 100,
          blockHash: '0x' + '55'.repeat(32),
          transactionHash: '0x' + '66'.repeat(32),
        },
      ];

      const mockProvider = {
        getBlockNumber: async () => 105,
        getLogs: async () => mockLogs,
      } as unknown as ethers.Provider;

      indexerService.setProvider(mockProvider, contractAddress);

      const rebuildResult = await indexerService.rebuildIndexFromLogs(0, 105);
      expect(rebuildResult.eventsIndexed).toBe(1);
      expect(rebuildResult.donationsCount).toBe(1);
      expect(rebuildResult.campaignsCount).toBe(1);

      const campaign = indexerService.getCampaignSummary(campaignId);
      expect(campaign).toBeDefined();
      expect(campaign?.totalNativeWei).toBe(donationWei);
      expect(campaign?.donationCount).toBe(1);

      const donation = indexerService.getIndexedDonation('0x' + '66'.repeat(32));
      expect(donation).toBeDefined();
      expect(donation?.donor.toLowerCase()).toBe(donor.toLowerCase());
      expect(donation?.amountWei).toBe(donationWei.toString());
      expect(donation?.assetType).toBe('NATIVE_ETH');
    });
  });
});
