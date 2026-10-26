import { ethers } from 'ethers';
import { TRUST_FABRIC_ABI } from './contractAbi.js';

export interface IndexedDonation {
  txHash: string;
  blockNumber: number;
  blockHash: string;
  donor: string;
  campaignId: string;
  recipient: string;
  amountWei?: string;
  tokenAddress?: string;
  tokenAmount?: string;
  assetType: 'NATIVE_ETH' | 'ERC20';
  timestamp?: number;
  confirmed: boolean;
}

export interface CampaignSummary {
  campaignId: string;
  recipient: string;
  title?: string;
  totalNativeWei: bigint;
  tokenTotals: Map<string, bigint>; // tokenAddress => total
  donationCount: number;
}

export interface VerificationReceiptResult {
  verified: boolean;
  txHash: string;
  blockNumber: number;
  confirmations: number;
  status: 'CONFIRMED' | 'REVERTED' | 'PENDING' | 'NOT_FOUND';
  donor?: string;
  campaignId?: string;
  recipient?: string;
  amount?: string;
  assetType?: 'NATIVE_ETH' | 'ERC20';
  tokenAddress?: string;
  error?: string;
}

/**
 * Reconstructable decentralized on-chain event indexer and independent receipt verification service.
 * Allows anyone to rebuild state from blockchain consensus without trusting backend database records.
 */
export class ChainIndexerService {
  private static instance: ChainIndexerService;
  private provider: ethers.Provider | null = null;
  private fallbackProviders: ethers.Provider[] = [];
  private contractAddress: string;

  // Reconstructed state indexes (can be wiped and rebuilt at any time from chain logs)
  private indexedDonations: Map<string, IndexedDonation> = new Map();
  private campaignSummaries: Map<string, CampaignSummary> = new Map();
  private anchoredCommitments: Set<string> = new Set();
  private anchoredMerkleRoots: Map<string, { manifestHash: string; leafCount: number; blockNumber: number }> = new Map();
  private lastIndexedBlock: number = 0;

  private constructor() {
    this.contractAddress = process.env.TRUSTFABRIC_CONTRACT_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3';
    this.initializeProviders();
  }

  public static getInstance(): ChainIndexerService {
    if (!ChainIndexerService.instance) {
      ChainIndexerService.instance = new ChainIndexerService();
    }
    return ChainIndexerService.instance;
  }

  public setProvider(customProvider: ethers.Provider, contractAddress?: string): void {
    this.provider = customProvider;
    if (contractAddress) {
      this.contractAddress = contractAddress;
    }
  }

  private initializeProviders(): void {
    const rpcUrls = [
      process.env.EVM_RPC_URL,
      process.env.ETHEREUM_SEPOLIA_RPC_URL,
      'https://rpc.sepolia.org',
      'https://eth-sepolia.public.blastapi.io',
    ].filter((url): url is string => Boolean(url));

    for (const url of rpcUrls) {
      try {
        const prov = new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true });
        if (!this.provider) {
          this.provider = prov;
        } else {
          this.fallbackProviders.push(prov);
        }
      } catch {
        // Skip uncontactable RPC endpoints
      }
    }
  }

  /**
   * Independently verify an on-chain transaction receipt against contract event logs.
   * Never relies on a frontend flag or database claim.
   */
  public async verifyDonationReceipt(
    txHash: string,
    expectedContract: string,
    expectedChainId?: number,
    minConfirmations: number = 1
  ): Promise<VerificationReceiptResult> {
    if (!this.provider) {
      return {
        verified: false,
        txHash,
        blockNumber: 0,
        confirmations: 0,
        status: 'NOT_FOUND',
        error: 'NO_RPC_PROVIDER_CONFIGURED',
      };
    }

    try {
      // 1. Fetch transaction receipt
      const receipt = await this.provider.getTransactionReceipt(txHash);
      if (!receipt) {
        return {
          verified: false,
          txHash,
          blockNumber: 0,
          confirmations: 0,
          status: 'PENDING',
          error: 'Transaction receipt not yet mined on-chain.',
        };
      }

      if (receipt.status === 0) {
        return {
          verified: false,
          txHash,
          blockNumber: receipt.blockNumber,
          confirmations: 0,
          status: 'REVERTED',
          error: 'Transaction execution reverted on-chain.',
        };
      }

      // 2. Validate chain ID if requested
      if (expectedChainId) {
        const network = await this.provider.getNetwork();
        if (Number(network.chainId) !== expectedChainId) {
          return {
            verified: false,
            txHash,
            blockNumber: receipt.blockNumber,
            confirmations: 0,
            status: 'CONFIRMED',
            error: `CHAIN_MISMATCH: Connected to chain ${network.chainId}, expected ${expectedChainId}.`,
          };
        }
      }

      // 3. Validate confirmation depth
      const currentBlock = await this.provider.getBlockNumber();
      const confirmations = currentBlock - receipt.blockNumber + 1;
      if (confirmations < minConfirmations) {
        return {
          verified: false,
          txHash,
          blockNumber: receipt.blockNumber,
          confirmations,
          status: 'PENDING',
          error: `INSUFFICIENT_CONFIRMATIONS: Received ${confirmations}, required ${minConfirmations}.`,
        };
      }

      // 4. Parse contract event logs from receipt to guarantee execution of expected function
      const iface = new ethers.Interface(TRUST_FABRIC_ABI);
      let foundEvent = false;
      let donor: string | undefined;
      let campaignId: string | undefined;
      let recipient: string | undefined;
      let amount: string | undefined;
      let assetType: 'NATIVE_ETH' | 'ERC20' = 'NATIVE_ETH';
      let tokenAddress: string | undefined;

      const normalizedExpectedContract = expectedContract.toLowerCase();

      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== normalizedExpectedContract) {
          continue;
        }

        try {
          const parsed = iface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });

          if (parsed?.name === 'DonationReceived') {
            foundEvent = true;
            donor = parsed.args[0];
            campaignId = parsed.args[1];
            recipient = parsed.args[2];
            amount = parsed.args[3].toString();
            assetType = 'NATIVE_ETH';
            break;
          } else if (parsed?.name === 'TokenDonationReceived') {
            foundEvent = true;
            donor = parsed.args[0];
            campaignId = parsed.args[1];
            recipient = parsed.args[2];
            tokenAddress = parsed.args[3];
            amount = parsed.args[4].toString();
            assetType = 'ERC20';
            break;
          }
        } catch {
          // Log not in contract ABI, continue checking
        }
      }

      if (!foundEvent) {
        return {
          verified: false,
          txHash,
          blockNumber: receipt.blockNumber,
          confirmations,
          status: 'CONFIRMED',
          error: 'EXPECTED_EVENT_NOT_EMITTED: Receipt succeeded but no valid donation event was emitted by contract.',
        };
      }

      return {
        verified: true,
        txHash,
        blockNumber: receipt.blockNumber,
        confirmations,
        status: 'CONFIRMED',
        donor,
        campaignId,
        recipient,
        amount,
        assetType,
        tokenAddress,
      };
    } catch (err: any) {
      return {
        verified: false,
        txHash,
        blockNumber: 0,
        confirmations: 0,
        status: 'NOT_FOUND',
        error: `RPC_LOOKUP_FAILED: ${err.message}`,
      };
    }
  }

  /**
   * Rebuilds index state from scratch by replaying all contract events from fromBlock to toBlock
   */
  public async rebuildIndexFromLogs(fromBlock: number = 0, toBlock?: number): Promise<{
    eventsIndexed: number;
    donationsCount: number;
    campaignsCount: number;
    anchoredRootsCount: number;
  }> {
    if (!this.provider) {
      throw new Error('Cannot rebuild index: No provider configured.');
    }

    const endBlock = toBlock || (await this.provider.getBlockNumber());
    const contract = new ethers.Contract(this.contractAddress, TRUST_FABRIC_ABI, this.provider);

    // Reset current ephemeral indexes
    this.indexedDonations.clear();
    this.campaignSummaries.clear();
    this.anchoredCommitments.clear();
    this.anchoredMerkleRoots.clear();

    // Query past events
    const filter = {
      address: this.contractAddress,
      fromBlock,
      toBlock: endBlock,
    };

    const logs = await this.provider.getLogs(filter);
    const iface = new ethers.Interface(TRUST_FABRIC_ABI);

    let eventCount = 0;

    for (const log of logs) {
      try {
        const parsed = iface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });

        if (!parsed) continue;
        eventCount++;

        if (parsed.name === 'DonationReceived') {
          const donor = parsed.args[0];
          const campaignId = parsed.args[1];
          const recipient = parsed.args[2];
          const amountWei = BigInt(parsed.args[3].toString());

          this.indexedDonations.set(log.transactionHash, {
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            blockHash: log.blockHash,
            donor,
            campaignId,
            recipient,
            amountWei: amountWei.toString(),
            assetType: 'NATIVE_ETH',
            confirmed: true,
          });

          // Aggregate campaign summary
          const existing = this.campaignSummaries.get(campaignId) || {
            campaignId,
            recipient,
            totalNativeWei: 0n,
            tokenTotals: new Map<string, bigint>(),
            donationCount: 0,
          };
          existing.totalNativeWei += amountWei;
          existing.donationCount += 1;
          this.campaignSummaries.set(campaignId, existing);
        } else if (parsed.name === 'TokenDonationReceived') {
          const donor = parsed.args[0];
          const campaignId = parsed.args[1];
          const recipient = parsed.args[2];
          const tokenAddress = parsed.args[3].toLowerCase();
          const amount = BigInt(parsed.args[4].toString());

          this.indexedDonations.set(log.transactionHash, {
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            blockHash: log.blockHash,
            donor,
            campaignId,
            recipient,
            tokenAddress,
            tokenAmount: amount.toString(),
            assetType: 'ERC20',
            confirmed: true,
          });

          const existing = this.campaignSummaries.get(campaignId) || {
            campaignId,
            recipient,
            totalNativeWei: 0n,
            tokenTotals: new Map<string, bigint>(),
            donationCount: 0,
          };
          const currentTokenTotal = existing.tokenTotals.get(tokenAddress) || 0n;
          existing.tokenTotals.set(tokenAddress, currentTokenTotal + amount);
          existing.donationCount += 1;
          this.campaignSummaries.set(campaignId, existing);
        } else if (parsed.name === 'MerkleBatchAnchored') {
          const batchRoot = parsed.args[0];
          const manifestHash = parsed.args[1];
          const leafCount = Number(parsed.args[2]);

          this.anchoredMerkleRoots.set(batchRoot.toLowerCase(), {
            manifestHash,
            leafCount,
            blockNumber: log.blockNumber,
          });
        }
      } catch {
        // Skip unparsable logs
      }
    }

    this.lastIndexedBlock = endBlock;

    return {
      eventsIndexed: eventCount,
      donationsCount: this.indexedDonations.size,
      campaignsCount: this.campaignSummaries.size,
      anchoredRootsCount: this.anchoredMerkleRoots.size,
    };
  }

  public getCampaignSummary(campaignId: string): CampaignSummary | undefined {
    return this.campaignSummaries.get(campaignId);
  }

  public getIndexedDonation(txHash: string): IndexedDonation | undefined {
    return this.indexedDonations.get(txHash);
  }

  public isMerkleRootAnchored(root: string): boolean {
    return this.anchoredMerkleRoots.has(root.toLowerCase());
  }

  public getLastIndexedBlock(): number {
    return this.lastIndexedBlock;
  }
}
