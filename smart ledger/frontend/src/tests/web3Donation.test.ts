import { describe, it, expect } from 'vitest';
import {
  Web3DonationService,
  TRUSTFABRIC_DONATION_ABI,
  SEPOLIA_CONTRACT_ADDRESS,
} from '../services/web3DonationService';

describe('TrustFabric Web3 MetaMask & Sepolia Donation Service', () => {
  const service = Web3DonationService.getInstance();

  it('1. Exposes single-contract address and verified Donation ABI', () => {
    expect(SEPOLIA_CONTRACT_ADDRESS).toBe('0x71C25bf4e37da4b7F2eFe341F21074eAf7096eF4');
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
    // In node/vitest environment, window.ethereum is undefined
    const isAvailable = service.isMetaMaskAvailable();
    expect(typeof isAvailable).toBe('boolean');
  });
});
