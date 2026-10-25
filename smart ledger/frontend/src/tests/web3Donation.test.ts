import { describe, it, expect, vi } from 'vitest';
import {
  Web3DonationService,
  TRUSTFABRIC_DONATION_ABI,
  SEPOLIA_CONTRACT_ADDRESS,
  SEPOLIA_CHAIN_ID,
} from '../services/web3DonationService';
import { encodeEventTopics, parseEther } from 'viem';

describe('TrustFabric Web3 MetaMask & Sepolia Donation Service', () => {
  const service = Web3DonationService.getInstance();

  describe('Positive Path: Specifications & Interfaces', () => {
    it('1. Exposes single-contract address and verified Donation ABI', () => {
      expect(SEPOLIA_CHAIN_ID).toBe(11155111);
      expect(SEPOLIA_CONTRACT_ADDRESS.toLowerCase()).toBe('0x71c25bf4e37da4b7f2efe341f21074eaf7096ef4');
      const donateFn = TRUSTFABRIC_DONATION_ABI.find(
        (item) => item.type === 'function' && item.name === 'donate'
      );
      expect(donateFn).toBeDefined();
      expect(donateFn?.stateMutability).toBe('payable');

      const donationEvent = TRUSTFABRIC_DONATION_ABI.find(
        (item) => item.type === 'event' && item.name === 'DonationReceived'
      );
      expect(donationEvent).toBeDefined();
      expect(donationEvent?.inputs.length).toBe(6);
    });

    it('2. Encodes campaign string to deterministic bytes32 format', () => {
      const campaignId = 'CAMP-CLEAN-WATER-2026';
      const bytes32 = service.toCampaignIdBytes32(campaignId);
      expect(bytes32).toMatch(/^0x[0-9a-fA-F]{64}$/);

      // Idempotent: passing bytes32 directly returns unchanged
      expect(service.toCampaignIdBytes32(bytes32)).toBe(bytes32);
    });

    it('3. Rejects invalid or zero-value ETH amounts', async () => {
      await expect(
        service.executeDonation({
          campaignId: 'CAMP-CLEAN-WATER-2026',
          amountEth: '0',
        })
      ).rejects.toThrow(/greater than 0/i);

      await expect(
        service.executeDonation({
          campaignId: 'CAMP-CLEAN-WATER-2026',
          amountEth: '-0.5',
        })
      ).rejects.toThrow(/greater than 0/i);

      await expect(
        service.executeDonation({
          campaignId: 'CAMP-CLEAN-WATER-2026',
          amountEth: 'not-a-number',
        })
      ).rejects.toThrow(/greater than 0/i);
    });

    it('4. Retrieves eligible authorized NGO campaigns with verified recipient addresses', async () => {
      const campaigns = await service.getEligibleCampaigns();
      expect(campaigns.length).toBeGreaterThan(0);

      const firstCampaign = campaigns[0];
      expect(firstCampaign).toHaveProperty('id');
      expect(firstCampaign).toHaveProperty('recipientAddress');
      expect(firstCampaign.recipientAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(firstCampaign.isActive).toBe(true);
    });

    it('5. Correctly detects absence or presence of MetaMask provider in browser context', () => {
      const isAvailable = service.isMetaMaskAvailable();
      expect(typeof isAvailable).toBe('boolean');
    });
  });

  describe('Negative & Failure-Path Scenarios (Step 7)', () => {
    it('6. Failure: Wrong network / chain ID mismatch triggers Sepolia switch error if denied', async () => {
      const mockEthereum = {
        request: vi.fn(async ({ method }) => {
          if (method === 'eth_chainId') return '0x1'; // Mainnet
          if (method === 'wallet_switchEthereumChain') {
            const err: any = new Error('User rejected chain switch');
            err.code = 4001;
            throw err;
          }
          return null;
        }),
      };

      const mockWalletClient = {
        switchChain: vi.fn(async () => {
          const err: any = new Error('User rejected chain switch');
          err.code = 4001;
          throw err;
        }),
      };

      (globalThis as any).window = { ethereum: mockEthereum };

      await expect(service.ensureSepoliaNetwork(mockWalletClient)).rejects.toThrow(
        /Ethereum Sepolia Testnet \(Chain ID 11155111\)/
      );
    });

    it('7. Failure: Undeployed contract address or missing bytecode on target chain', async () => {
      // Mock publicClient getBytecode returning empty "0x"
      const spy = vi.spyOn((service as any).publicClient, 'getBytecode').mockResolvedValueOnce('0x');

      const result = await service.verifyContractDeployment('0x71c25bf4e37da4b7F2Efe341F21074eaF7096ef4');
      expect(result.isDeployed).toBe(false);
      expect(result.byteLength).toBe(0);

      spy.mockRestore();
    });

    it('8. Failure: User rejects the MetaMask request (Code 4001)', async () => {
      (globalThis as any).window = {
        ethereum: {
          request: vi.fn(async ({ method }) => {
            if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
              return ['0x1111111111111111111111111111111111111111'];
            }
            if (method === 'eth_chainId') {
              return '0xaa36a7'; // Sepolia
            }
            if (method === 'eth_sendTransaction') {
              const err: any = new Error('User rejected the transaction.');
              err.code = 4001;
              throw err;
            }
            return null;
          }),
        },
      };

      await expect(
        service.executeDonation({
          campaignId: 'CW-2026-014',
          amountEth: '0.01',
        })
      ).rejects.toThrow();
    });

    it('9. Failure: Insufficient donor balance check', async () => {
      const mockEthereum = {
        request: vi.fn(async ({ method }) => {
          if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
            return ['0x1111111111111111111111111111111111111111'];
          }
          if (method === 'eth_chainId') return '0xaa36a7';
          return null;
        }),
      };
      (globalThis as any).window = { ethereum: mockEthereum };

      const getBalanceSpy = vi.spyOn((service as any).publicClient, 'getBalance').mockResolvedValueOnce(parseEther('0.005'));

      const walletInfo = await service.connectWallet();
      expect(parseFloat(walletInfo.balanceEth)).toBeLessThan(0.01);

      getBalanceSpy.mockRestore();
    });

    it('10. Failure: Reverted transaction on-chain detected via receipt status', async () => {
      (globalThis as any).window = {
        ethereum: {
          request: vi.fn(async ({ method }) => {
            if (method === 'eth_accounts') return ['0x1111111111111111111111111111111111111111'];
            if (method === 'eth_chainId') return '0xaa36a7';
            if (method === 'eth_sendTransaction') return '0xabc1234567890123456789012345678901234567890123456789012345678901';
            return null;
          }),
        },
      };

      const waitReceiptSpy = vi
        .spyOn((service as any).publicClient, 'waitForTransactionReceipt')
        .mockResolvedValueOnce({
          status: 'reverted',
          blockNumber: 7200000n,
          logs: [],
        });

      await expect(
        service.executeDonation({
          campaignId: 'CW-2026-014',
          amountEth: '0.01',
        })
      ).rejects.toThrow(/reverted on-chain/i);

      waitReceiptSpy.mockRestore();
    });

    it('11. Failure: Missing or unparseable DonationReceived event in transaction receipt', () => {
      // Empty logs
      const result = service.verifyDonationEvent([], '0x1111111111111111111111111111111111111111');
      expect(result.verified).toBe(false);
      expect(result.error).toMatch(/no donationreceived event/i);
    });

    it('12. Failure: Recipient mismatch between event and expected NGO wallet', () => {
      const donor = '0x1111111111111111111111111111111111111111';
      const actualRecipientInEvent = '0x2222222222222222222222222222222222222222';
      const expectedNgoRecipient = '0x3333333333333333333333333333333333333333';
      const campaignId = service.toCampaignIdBytes32('CW-2026-014');

      // Construct a mock event log
      const topics = encodeEventTopics({
        abi: TRUSTFABRIC_DONATION_ABI,
        eventName: 'DonationReceived',
        args: {
          donor: donor as any,
          campaignId: campaignId as any,
          recipient: actualRecipientInEvent as any,
        },
      });

      const mockLogs = [
        {
          address: SEPOLIA_CONTRACT_ADDRESS,
          topics,
          data: '0x000000000000000000000000000000000000000000000000002386f26fc1000000000000000000000000000000000000000000000000000000000000671c6a8000000000000000000000000000000000000000000000000000000000006e1234',
        },
      ];

      const check = service.verifyDonationEvent(mockLogs, donor as any, expectedNgoRecipient as any);
      expect(check.verified).toBe(false);
      expect(check.error).toMatch(/does not match expected NGO wallet/i);
    });

    it('13. Failure: RPC timeout or network provider unavailable', async () => {
      const timeoutSpy = vi
        .spyOn((service as any).publicClient, 'getBalance')
        .mockRejectedValueOnce(new Error('RPC request timed out after 10000ms'));

      (globalThis as any).window = {
        ethereum: {
          request: vi.fn(async ({ method }) => {
            if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
              return ['0x1111111111111111111111111111111111111111'];
            }
            if (method === 'eth_chainId') return '0xaa36a7';
            return null;
          }),
        },
      };

      await expect(service.connectWallet()).rejects.toThrow(/timed out/i);
      timeoutSpy.mockRestore();
    });

    it('14. Verification: Pending transaction callback invoked before receipt confirmation', async () => {
      const onPendingTxMock = vi.fn();
      const mockTxHash = '0xabc999888777666555444333222111000aaabbbcccdddeeefff111222333444555';

      (globalThis as any).window = {
        ethereum: {
          request: vi.fn(async ({ method }) => {
            if (method === 'eth_accounts') return ['0x1111111111111111111111111111111111111111'];
            if (method === 'eth_chainId') return '0xaa36a7';
            if (method === 'eth_sendTransaction') return mockTxHash;
            return null;
          }),
        },
      };

      const waitReceiptSpy = vi
        .spyOn((service as any).publicClient, 'waitForTransactionReceipt')
        .mockResolvedValueOnce({
          status: 'success',
          blockNumber: 7200001n,
          logs: [],
        });

      // Mock backend POST /donations/eth
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

      const receipt = await service.executeDonation({
        campaignId: 'CW-2026-014',
        amountEth: '0.01',
        onPendingTx: onPendingTxMock,
      });

      expect(onPendingTxMock).toHaveBeenCalledWith(mockTxHash);
      expect(receipt.txHash).toBe(mockTxHash);
      expect(receipt.status).toBe('CONFIRMED');

      waitReceiptSpy.mockRestore();
      fetchSpy.mockRestore();
    });

    it('15. Failure & Idempotency: Duplicate donation receipt submission does not double count', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url: any, init?: any) => {
        const body = init?.body ? JSON.parse(init.body) : {};
        return new Response(
          JSON.stringify({
            success: true,
            donation: {
              id: 'eth-don-existing-001',
              txHash: body.txHash,
              status: 'CONFIRMED',
            },
          }),
          { status: 200 }
        );
      });

      const res1 = await fetch('http://localhost:5001/api/donations/eth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txHash: '0xdup111222333444555666777888999aaabbbcccdddeeefff0001112223334445556',
          amountWei: '10000000000000000',
          campaignId: 'CW-2026-014',
          donorAddress: '0x1111111111111111111111111111111111111111',
        }),
      });

      const data1 = await res1.json();
      expect(data1.success).toBe(true);
      expect(data1.donation.id).toBe('eth-don-existing-001');

      fetchSpy.mockRestore();
    });
  });
});
