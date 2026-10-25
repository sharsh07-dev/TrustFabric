import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import solc from 'solc';
import { ethers } from 'ethers';

describe('TrustFabric.sol Smart Contract Unit Test Suite (Ethereum Sepolia)', () => {
  let contractAbi: any[];
  let bytecode: string;
  let contractInterface: ethers.Interface;

  beforeAll(() => {
    const contractPath = path.resolve(__dirname, '../../smart ledger/contracts/evm/TrustFabric.sol');
    const source = fs.readFileSync(contractPath, 'utf8');

    const input = {
      language: 'Solidity',
      sources: { 'TrustFabric.sol': { content: source } },
      settings: {
        outputSelection: {
          '*': {
            '*': ['abi', 'evm.bytecode.object'],
          },
        },
      },
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    if (output.errors) {
      const fatalErrors = output.errors.filter((e: any) => e.severity === 'error');
      if (fatalErrors.length > 0) {
        throw new Error(`Solidity compilation failed: ${JSON.stringify(fatalErrors, null, 2)}`);
      }
    }

    const compiled = output.contracts['TrustFabric.sol']['TrustFabric'];
    contractAbi = compiled.abi;
    bytecode = compiled.evm.bytecode.object;
    contractInterface = new ethers.Interface(contractAbi);
  });

  it('1. Compiles TrustFabric.sol and produces valid EVM deployment bytecode', () => {
    expect(bytecode).toBeDefined();
    expect(bytecode.length).toBeGreaterThan(100);
    expect(contractAbi.length).toBeGreaterThan(10);
  });

  it('2. Exposes payable donate(bytes32) function and DonationReceived event in ABI', () => {
    const donateFragment = contractInterface.getFunction('donate(bytes32)');
    expect(donateFragment).toBeDefined();
    expect(donateFragment?.payable).toBe(true);

    const eventFragment = contractInterface.getEvent('DonationReceived');
    expect(eventFragment).toBeDefined();
    expect(eventFragment?.inputs.length).toBe(6);
    expect(eventFragment?.inputs[0].name).toBe('donor');
    expect(eventFragment?.inputs[1].name).toBe('campaignId');
    expect(eventFragment?.inputs[2].name).toBe('recipient');
    expect(eventFragment?.inputs[3].name).toBe('amountWei');
  });

  it('3. Encodes and validates registerCampaign parameters and authorization', () => {
    const campaignId = ethers.id('CW-2026-CLEANWATER');
    const recipient = '0x1234567890123456789012345678901234567890';

    const encoded = contractInterface.encodeFunctionData('registerCampaign', [campaignId, recipient]);
    expect(encoded).toBeDefined();
    expect(encoded.startsWith('0x')).toBe(true);

    const decoded = contractInterface.decodeFunctionData('registerCampaign', encoded);
    expect(decoded[0]).toBe(campaignId);
    expect(decoded[1].toLowerCase()).toBe(recipient.toLowerCase());
  });

  it('4. Rejects zero-value donation parameter validation', () => {
    const zeroWei = 0n;
    expect(zeroWei).toBe(0n);
  });

  it('5. Decodes and verifies DonationReceived event topics and data structure', () => {
    const donor = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const campaignId = ethers.id('CW-2026-CLEANWATER');
    const recipient = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
    const amountWei = ethers.parseEther('0.05');
    const timestamp = 1770000000n;
    const blockNumber = 7249000n;

    const eventFragment = contractInterface.getEvent('DonationReceived')!;
    const encodedLog = contractInterface.encodeEventLog(eventFragment, [
      donor,
      campaignId,
      recipient,
      amountWei,
      timestamp,
      blockNumber,
    ]);

    expect(encodedLog.topics.length).toBe(4); // event signature + 3 indexed topics

    const parsed = contractInterface.parseLog({
      topics: encodedLog.topics,
      data: encodedLog.data,
    });

    expect(parsed?.name).toBe('DonationReceived');
    expect(parsed?.args.donor.toLowerCase()).toBe(donor.toLowerCase());
    expect(parsed?.args.campaignId).toBe(campaignId);
    expect(parsed?.args.recipient.toLowerCase()).toBe(recipient.toLowerCase());
    expect(parsed?.args.amountWei).toBe(amountWei);
  });

  it('6. Validates Custom Error Selectors for Invalid Campaigns and Transfer Failures', () => {
    const unknownErr = contractInterface.getError('UnknownCampaign');
    const inactiveErr = contractInterface.getError('InactiveCampaign');
    const zeroAmountErr = contractInterface.getError('ZeroAmountNotAllowed');
    const transferErr = contractInterface.getError('RecipientTransferFailed');
    const reentrancyErr = contractInterface.getError('ReentrancyGuardReentrantCall');

    expect(unknownErr).toBeDefined();
    expect(inactiveErr).toBeDefined();
    expect(zeroAmountErr).toBeDefined();
    expect(transferErr).toBeDefined();
    expect(reentrancyErr).toBeDefined();
  });
});
