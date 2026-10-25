import { describe, it, expect, beforeEach } from 'vitest';
import { FiatAdapter } from '../services/adapters/fiatAdapter';
import { BridgeSwapAdapter } from '../services/adapters/bridgeSwapAdapter';
import { EvidenceService } from '../services/evidenceService';
import { type ExpenseClaim, type FinancialEvent } from '../types/trustfabric';

describe('TrustFabric Adapters & Ingestion (P1)', () => {
  let evidenceService: EvidenceService;

  beforeEach(() => {
    evidenceService = new EvidenceService();
  });

  describe('FiatAdapter Bank Statement Ingestion', () => {
    it('parses valid bank statement CSV and converts amounts to integer minor units', () => {
      const csv = `TransactionDate, ClearingDate, BankAccount, CounterpartyName, PaymentReference, Amount, Currency, Fee
2026-02-14, 2026-02-14, HDFC-8921, GreenBuild Supplies Ltd, INV-2026-001, 42500.00, INR, 15.00
2026-02-15, 2026-02-15, HDFC-8921, AquaTech Drilling Co, INV-2026-002, 85000.00, INR, 25.00`;

      const result = FiatAdapter.parseBankStatementCsv(csv, true);
      expect(result.success).toBe(true);
      expect(result.entries.length).toBe(2);
      expect(result.entries[0].amountMinor).toBe(4250000); // ₹42,500 * 100
      expect(result.entries[0].counterpartyName).toBe('GreenBuild Supplies Ltd');
      expect(result.entries[0].isSignedByBankApi).toBe(true);
      expect(result.duplicateCount).toBe(0);
    });

    it('detects and rejects duplicate statement lines', () => {
      const csvWithDup = `TransactionDate, ClearingDate, BankAccount, CounterpartyName, PaymentReference, Amount, Currency
2026-02-14, 2026-02-14, HDFC-8921, GreenBuild Supplies Ltd, INV-2026-001, 42500.00, INR
2026-02-14, 2026-02-14, HDFC-8921, GreenBuild Supplies Ltd, INV-2026-001, 42500.00, INR`;

      const result = FiatAdapter.parseBankStatementCsv(csvWithDup, false);
      expect(result.entries.length).toBe(1);
      expect(result.duplicateCount).toBe(1);
      expect(result.errors.some(e => e.includes('Duplicate statement transaction line ignored'))).toBe(true);
    });

    it('rejects malformed CSV with missing required headers', () => {
      const invalidCsv = `Date, Description, Total
2026-02-14, Payment, 42500`;

      const result = FiatAdapter.parseBankStatementCsv(invalidCsv);
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Missing required CSV columns');
    });

    it('reconciles an expense claim against matching bank statement line', () => {
      const claim: ExpenseClaim = {
        id: 'claim-01',
        grantId: 'grant-cw-014',
        vendorRef: 'GreenBuild Supplies Ltd',
        invoiceNumberToken: 'INV-2026-001',
        currency: 'INR',
        amountMinor: 4250000,
        invoiceDate: '2026-02-14',
        category: 'MATERIALS',
        purposeRef: 'Clean Water Well Drilling Materials',
        claimStatus: 'VERIFIED',
        disbursementStatus: 'RELEASE_ELIGIBLE',
        createdAt: '2026-02-14T09:00:00Z',
        updatedAt: '2026-02-14T09:00:00Z',
      };

      const statementEntries = [
        {
          id: 'stmt-01',
          transactionDate: '2026-02-14',
          clearingDate: '2026-02-14',
          bankAccountIbanOrMasked: 'HDFC-8921',
          counterpartyName: 'GreenBuild Supplies Ltd',
          paymentReferenceToken: 'INV-2026-001',
          amountMinor: 4250000,
          currency: 'INR',
          feeMinor: 1500,
          isSignedByBankApi: true,
        },
      ];

      const match = FiatAdapter.matchClaimToBankStatement(claim, statementEntries);
      expect(match.matched).toBe(true);
      expect(match.differenceMinor).toBe(0);
      expect(match.status).toBe('SOURCE_ATTESTED');
      expect(match.edge?.edgeType).toBe('PAYMENT');
    });
  });

  describe('BridgeSwapAdapter Multi-Hop Reconciliation', () => {
    it('marks bridge hop as UNRECONCILED when validator proof is missing', () => {
      const lockEvent: FinancialEvent = {
        id: 'evt-lock-01',
        grantId: 'grant-cw-014',
        eventType: 'BRIDGE_LOCK',
        sourceType: 'ETHEREUM',
        sourceChainId: '1',
        txHash: '0x123',
        finalityStatus: 'FINALIZED',
        sourceAccountRef: '0xFrom',
        destinationRef: '0xBridgeLock',
        assetId: 'USDC',
        amountMinor: 12500000,
        currency: 'USD',
        feeMinor: 5000,
        occurredAt: '2026-02-14T10:00:00Z',
        observedAt: '2026-02-14T10:00:00Z',
        provenance: 'ON_CHAIN',
        simulated: true,
        idempotencyKey: 'idem-lock-01',
      };

      const edge = BridgeSwapAdapter.reconcileBridgeHop(lockEvent, undefined, undefined);
      expect(edge.linkStatus).toBe('UNRECONCILED');
      expect(edge.confidenceReason).toContain('UNRECONCILED');
      expect(edge.toEventId).toBe('UNRESOLVED_DESTINATION_HOP');
    });

    it('verifies bridge hop when confirmed validator proof is provided', () => {
      const lockEvent: FinancialEvent = {
        id: 'evt-lock-01',
        grantId: 'grant-cw-014',
        eventType: 'BRIDGE_LOCK',
        sourceType: 'ETHEREUM',
        sourceChainId: '1',
        txHash: '0x123',
        finalityStatus: 'FINALIZED',
        sourceAccountRef: '0xFrom',
        destinationRef: '0xBridgeLock',
        assetId: 'USDC',
        amountMinor: 12500000,
        currency: 'USD',
        feeMinor: 5000,
        occurredAt: '2026-02-14T10:00:00Z',
        observedAt: '2026-02-14T10:00:00Z',
        provenance: 'ON_CHAIN',
        simulated: false,
        idempotencyKey: 'idem-lock-02',
      };

      const mintEvent: FinancialEvent = {
        id: 'evt-mint-01',
        grantId: 'grant-cw-014',
        eventType: 'BRIDGE_MINT',
        sourceType: 'POLYGON',
        sourceChainId: '137',
        txHash: '0x456',
        finalityStatus: 'FINALIZED',
        sourceAccountRef: '0xBridgeMint',
        destinationRef: '0xNGO',
        assetId: 'USDC',
        amountMinor: 12485000,
        currency: 'USD',
        feeMinor: 2000,
        occurredAt: '2026-02-14T10:15:00Z',
        observedAt: '2026-02-14T10:15:00Z',
        provenance: 'ON_CHAIN',
        simulated: false,
        idempotencyKey: 'idem-mint-02',
      };

      const proof = {
        bridgeProtocol: 'PolygonPoSBridge',
        sourceChainId: '1',
        sourceTxHash: '0x123',
        destinationChainId: '137',
        destinationTxHash: '0x456',
        lockBlockNumber: 19842100,
        mintBlockNumber: 54910283,
        validatorSignatures: ['0xsig1', '0xsig2', '0xsig3'],
        relayerFeeMinor: 15000,
        isConfirmed: true,
      };

      const edge = BridgeSwapAdapter.reconcileBridgeHop(lockEvent, mintEvent, proof);
      expect(edge.linkStatus).toBe('VERIFIED');
      expect(edge.feeMinor).toBe(15000);
      expect(edge.confidenceReason).toContain('3 validator signatures');
    });
  });

  describe('EvidenceService Document Ingestion Security', () => {
    it('rejects files exceeding 10MB security limit', async () => {
      const largeBytes = new Uint8Array(11 * 1024 * 1024); // 11MB
      await expect(
        evidenceService.ingestDocument({
          claimId: 'claim-large',
          filename: 'large_invoice.pdf',
          mimeType: 'application/pdf',
          fileBytes: largeBytes,
          uploadedBy: 'usr-admin',
          extractedFields: {
            vendorName: 'Apex',
            invoiceNumber: 'INV-1',
            date: '2026-02-14',
            totalAmountMinor: 1000,
            currency: 'INR',
            isOcrExtracted: false,
          },
        })
      ).rejects.toThrow('exceeds 10MB security limit');
    });

    it('rejects disallowed executable MIME types', async () => {
      const bytes = new Uint8Array([0x4d, 0x5a]); // MZ executable header
      await expect(
        evidenceService.ingestDocument({
          claimId: 'claim-exe',
          filename: 'malicious.exe',
          mimeType: 'application/x-msdownload',
          fileBytes: bytes,
          uploadedBy: 'usr-admin',
          extractedFields: {
            vendorName: 'Hacker',
            invoiceNumber: 'INV-EXE',
            date: '2026-02-14',
            totalAmountMinor: 1000,
            currency: 'INR',
            isOcrExtracted: false,
          },
        })
      ).rejects.toThrow('MIME type "application/x-msdownload" is not permitted');
    });
  });
});
