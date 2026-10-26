import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  web3DonationService,
  Web3DonationService,
  TRUST_FABRIC_SEPOLIA_ADDRESS,
  type VerifiedTransactionAudit,
  type LiveTrackerStage,
} from '../services/web3DonationService';

describe('Live On-Chain Transaction Tracker & Independent Verifier', () => {
  const dummyTxHash = '0x88df6d15a55a034293f4083f42c2621415eb6180ec6118d7f26cff680fa2a9fa' as `0x${string}`;
  const dummyDonor = '0x1234567890123456789012345678901234567890' as `0x${string}`;
  const dummyRecipient = '0x92b34c67d2b1ce09874a12d3a6f1959728864f71' as `0x${string}`;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects malformed transaction hash formats before network call', async () => {
    await expect(web3DonationService.verifyExternalTransaction('0xinvalid')).rejects.toThrow(
      'Invalid transaction hash format'
    );

    await expect(web3DonationService.verifyExternalTransaction('')).rejects.toThrow(
      'Invalid transaction hash format'
    );
  });

  it('correctly reports pending state when transaction receipt is not yet mined', async () => {
    const mockClient = {
      getTransactionReceipt: vi.fn().mockResolvedValue(null),
      getBlockNumber: vi.fn().mockResolvedValue(5500000n),
    };
    web3DonationService.setPublicClient(mockClient);
    web3DonationService.setFallbackClients([]);

    const result = await web3DonationService.verifyExternalTransaction(dummyTxHash);
    expect(result.stage).toBe('PENDING_SEPOLIA');
    expect(result.confirmationsReached).toBe(0);
    expect(result.eventVerified).toBe(false);
    expect(result.explorerUrl).toBe(`https://sepolia.etherscan.io/tx/${dummyTxHash}`);
  });

  it('decodes receipt, confirms DonationReceived event, and marks CONFIRMED_DONATION', async () => {
    const mockReceipt = {
      transactionHash: dummyTxHash,
      status: 'success',
      blockNumber: 5500000n,
      gasUsed: 45000n,
      effectiveGasPrice: 2000000000n,
      from: dummyDonor,
      to: TRUST_FABRIC_SEPOLIA_ADDRESS,
      logs: [
        {
          address: TRUST_FABRIC_SEPOLIA_ADDRESS,
          // DonationReceived(address,string,uint256,address)
          topics: [
            '0xc8749a5aa9fb49dbd7bc28ee550da6b9c9f2b87e2f5f1ae1b8492080352ef29b',
            '0x0000000000000000000000001234567890123456789012345678901234567890',
            '0x43572d323032362d303134000000000000000000000000000000000000000000',
            '0x00000000000000000000000092b34c67d2b1ce09874a12d3a6f1959728864f71',
          ],
          data: '0x000000000000000000000000000000000000000000000000016345785d8a0000',
        },
      ],
    };

    const mockClient = {
      getTransactionReceipt: vi.fn().mockResolvedValue(mockReceipt),
      getBlockNumber: vi.fn().mockResolvedValue(5500005n), // 6 confirmations
      getBlock: vi.fn().mockResolvedValue({ timestamp: 1729900000n }),
    };
    web3DonationService.setPublicClient(mockClient);
    web3DonationService.setFallbackClients([]);

    const result = await web3DonationService.verifyExternalTransaction(dummyTxHash);

    expect(result.txHash).toBe(dummyTxHash);
    expect(result.stage).toBe('CONFIRMED_DONATION');
    expect(result.confirmationsReached).toBe(6);
    expect(result.blockNumber).toBe(5500000);
    expect(result.senderAddress?.toLowerCase()).toBe(dummyDonor.toLowerCase());
    expect(result.contractAddress?.toLowerCase()).toBe(TRUST_FABRIC_SEPOLIA_ADDRESS.toLowerCase());
    expect(result.explorerUrl).toBe(`https://sepolia.etherscan.io/tx/${dummyTxHash}`);
    expect(result.merkleBatchStatus).toBe('PENDING_NEXT_BATCH');
  });

  it('flags reverted transaction status on Sepolia', async () => {
    const mockReceipt = {
      transactionHash: dummyTxHash,
      status: 'reverted',
      blockNumber: 5500000n,
      gasUsed: 21000n,
      effectiveGasPrice: 2000000000n,
      from: dummyDonor,
      to: TRUST_FABRIC_SEPOLIA_ADDRESS,
      logs: [],
    };

    const mockClient = {
      getTransactionReceipt: vi.fn().mockResolvedValue(mockReceipt),
      getBlockNumber: vi.fn().mockResolvedValue(5500001n),
      getBlock: vi.fn().mockResolvedValue({ timestamp: 1729900000n }),
    };
    web3DonationService.setPublicClient(mockClient);
    web3DonationService.setFallbackClients([]);

    const result = await web3DonationService.verifyExternalTransaction(dummyTxHash);
    expect(result.stage).toBe('FAILED_OR_REVERTED');
    expect(result.eventVerified).toBe(false);
    expect(result.stageDescription).toContain('Transaction execution reverted');
  });

  it('tracks progression across multiple stages with onUpdate callbacks', async () => {
    const stagesRecorded: LiveTrackerStage[] = [];

    const mockReceipt = {
      transactionHash: dummyTxHash,
      status: 'success',
      blockNumber: 5500002n,
      gasUsed: 42000n,
      effectiveGasPrice: 2000000000n,
      from: dummyDonor,
      to: TRUST_FABRIC_SEPOLIA_ADDRESS,
      logs: [],
    };

    const mockClient = {
      getTransaction: vi.fn().mockResolvedValue({
        hash: dummyTxHash,
        from: dummyDonor,
        to: TRUST_FABRIC_SEPOLIA_ADDRESS,
        value: 100000000000000000n,
      }),
      getTransactionReceipt: vi.fn().mockResolvedValue(mockReceipt),
      getBlockNumber: vi.fn().mockResolvedValue(5500004n), // 3 confirmations >= 2
      getBlock: vi.fn().mockResolvedValue({ timestamp: 1729900000n }),
    };
    web3DonationService.setPublicClient(mockClient);
    web3DonationService.setFallbackClients([]);

    await web3DonationService.trackTransaction(
      dummyTxHash,
      (audit) => {
        stagesRecorded.push(audit.stage);
      },
      2,
      1000
    );

    expect(stagesRecorded.length).toBeGreaterThan(0);
    expect(stagesRecorded).toContain('CONFIRMED_DONATION');
  });
});
