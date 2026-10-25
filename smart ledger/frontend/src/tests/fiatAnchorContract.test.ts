import { describe, it, expect, beforeEach } from 'vitest';
import { FiatAnchorContractService } from '../services/fiatAnchorContractService';

describe('TrustFabric EVM Fiat Donation Anchor Smart Contract (PS 4.2)', () => {
  let anchorContract: FiatAnchorContractService;
  const owner = '0xOwnerSafeSepolia001';
  const relayer = '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720';
  const unauthorizedUser = '0xAttackerEve999';

  beforeEach(() => {
    anchorContract = new FiatAnchorContractService(owner, relayer);
  });

  it('allows authorized relayer to anchor a verified fiat donation commitment', () => {
    const commitment = '0x4f8a8b1c9e2d3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a';
    const grantRefHash = '0x1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff';

    const result = anchorContract.recordFiatDonation({
      caller: relayer,
      grantRefHash,
      paymentCommitment: commitment,
      amountPaise: 500000, // ₹5,000
      currencyCode: 'INR',
    });

    expect(result.success).toBe(true);
    expect(result.txHash).toMatch(/^0x[a-f0-9]{64}$/);
    expect(result.blockNumber).toBeGreaterThan(7000000);
    expect(result.gasUsed).toBeGreaterThan(0);
    expect(result.eventEmitted?.name).toBe('FiatDonationAnchored');
    expect(result.eventEmitted?.params.amountPaise).toBe(500000);
    expect(result.eventEmitted?.params.currencyCode).toBe('INR');

    // Query on-chain view function
    const query = anchorContract.getAnchor(commitment);
    expect(query.exists).toBe(true);
    expect(query.record?.amountPaise).toBe(500000);
    expect(query.record?.relayer).toBe(relayer);
  });

  it('rejects unauthorized caller attempting to anchor a commitment', () => {
    const result = anchorContract.recordFiatDonation({
      caller: unauthorizedUser,
      grantRefHash: '0x1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
      paymentCommitment: '0x4f8a8b1c9e2d3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8b',
      amountPaise: 100000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('UnauthorizedCaller');
  });

  it('rejects duplicate payment commitments (Replay Protection)', () => {
    const commitment = '0x4f8a8b1c9e2d3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8c';
    const grantRefHash = '0x1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff';

    // First anchor succeeds
    const first = anchorContract.recordFiatDonation({
      caller: relayer,
      grantRefHash,
      paymentCommitment: commitment,
      amountPaise: 250000,
    });
    expect(first.success).toBe(true);

    // Second anchor with same commitment must revert
    const second = anchorContract.recordFiatDonation({
      caller: relayer,
      grantRefHash,
      paymentCommitment: commitment,
      amountPaise: 250000,
    });
    expect(second.success).toBe(false);
    expect(second.error).toContain('DuplicatePaymentCommitment');
  });

  it('rejects zero amount or zero commitment hash', () => {
    const zeroCommitmentRes = anchorContract.recordFiatDonation({
      caller: relayer,
      grantRefHash: '0x1111',
      paymentCommitment: '0x' + '0'.repeat(64),
      amountPaise: 100000,
    });
    expect(zeroCommitmentRes.success).toBe(false);
    expect(zeroCommitmentRes.error).toContain('ZeroCommitmentNotAllowed');

    const zeroAmountRes = anchorContract.recordFiatDonation({
      caller: relayer,
      grantRefHash: '0x1111',
      paymentCommitment: '0x4f8a8b1c9e2d3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8d',
      amountPaise: 0,
    });
    expect(zeroAmountRes.success).toBe(false);
    expect(zeroAmountRes.error).toContain('ZeroAmountNotAllowed');
  });

  it('allows owner to update authorized relayer address', () => {
    const newRelayer = '0xNewRelayerSepolia7777';
    const updateRes = anchorContract.setRelayer(owner, newRelayer);
    expect(updateRes.success).toBe(true);
    expect(anchorContract.authorizedRelayer).toBe(newRelayer);

    // Old relayer can no longer anchor
    const failRes = anchorContract.recordFiatDonation({
      caller: relayer,
      grantRefHash: '0x1111',
      paymentCommitment: '0x4f8a8b1c9e2d3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8e',
      amountPaise: 100000,
    });
    expect(failRes.success).toBe(false);
    expect(failRes.error).toContain('UnauthorizedCaller');
  });
});
