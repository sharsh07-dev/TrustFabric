import { ethers } from 'ethers';
import crypto from 'crypto';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { DeterministicMerkleTree, type MerkleLeaf, type MerkleProofResult } from './merkleTree.js';
import { TRUSTFABRIC_FIAT_ANCHOR_ABI } from './contractAbi.js';

export type AnchorStatus = 'QUEUED' | 'BATCHING' | 'PENDING' | 'CONFIRMED' | 'FAILED' | 'UNKNOWN';

export interface QueuedCommitment {
  id: string;
  ownerId: string;
  organizationId?: string;
  evidenceDigest: string; // 32-byte hex hash
  idempotencyKey: string;
  status: AnchorStatus;
  failureReason?: string;
  batchId?: string;
  txHash?: string;
  explorerUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConfirmedMerkleBatch {
  id: string;
  batchIdHash: string;
  merkleRoot: string;
  leafCount: number;
  status: 'BATCHING' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED' | 'UNKNOWN';
  submissionAttempts: number;
  txHash?: string;
  chainId: number;
  contractAddress?: string;
  blockNumber?: number;
  gasUsed?: number;
  confirmedAt?: string;
  createdAt: string;
  updatedAt: string;
  leaves: Map<string, {
    leafIndex: number;
    leafDigest: string;
    proof: string[];
  }>;
}

export interface RelayerConfig {
  chainId: number;
  rpcUrl: string;
  relayerPrivateKey: string;
  relayerAddress: string;
  contractAddress: string;
  etherscanBaseUrl: string;
  redisUrl: string;
  maxBatchSize: number;
  batchWaitMs: number;
  confirmations: number;
}

/**
 * Live Ethereum Sepolia Testnet Relayer & BullMQ Batching Engine
 * Designed for 100+ concurrent users with single-coordinator nonce safety.
 */
export class LiveRelayerPipeline {
  private static instance: LiveRelayerPipeline;
  private config: RelayerConfig;

  private provider: ethers.JsonRpcProvider | null = null;
  private wallet: ethers.Wallet | null = null;
  private contract: ethers.Contract | null = null;

  private redisConnection: IORedis | null = null;
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  // Single-coordinator lock for strict sequential nonces
  private nonceMutex: Promise<void> = Promise.resolve();
  private managedNonce: number | null = null;

  // In-memory state store and index cache
  private commitments: Map<string, QueuedCommitment> = new Map();
  private idempotencyIndex: Map<string, string> = new Map(); // idempotencyKey -> commitmentId
  private batches: Map<string, ConfirmedMerkleBatch> = new Map();
  private pendingBatchQueue: QueuedCommitment[] = [];
  private batchFlushTimer: NodeJS.Timeout | null = null;

  private isConnectedToChain: boolean = false;
  private isRedisConnected: boolean = false;
  private connectionError: string | null = null;

  private constructor() {
    this.config = {
      chainId: parseInt(process.env.SEPOLIA_CHAIN_ID || '11155111', 10),
      rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org',
      relayerPrivateKey: process.env.SEPOLIA_RELAYER_PRIVATE_KEY || '',
      relayerAddress: process.env.SEPOLIA_RELAYER_ADDRESS || '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
      contractAddress: process.env.SEPOLIA_CONTRACT_ADDRESS || '0x71C25bf4e37da4b7F2eFe341F21074eAf7096eF4',
      etherscanBaseUrl: process.env.ETHERSCAN_BASE_URL || 'https://sepolia.etherscan.io',
      redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      maxBatchSize: parseInt(process.env.RELAYER_MAX_BATCH_SIZE || '16', 10),
      batchWaitMs: parseInt(process.env.RELAYER_BATCH_WAIT_MS || '400', 10),
      confirmations: parseInt(process.env.RELAYER_CONFIRMATIONS || '1', 10),
    };

    this.initializeEthers();
    this.initializeQueue();
  }

  public static getInstance(): LiveRelayerPipeline {
    if (!LiveRelayerPipeline.instance) {
      LiveRelayerPipeline.instance = new LiveRelayerPipeline();
    }
    return LiveRelayerPipeline.instance;
  }

  private initializeEthers(): void {
    try {
      if (this.config.rpcUrl && this.config.rpcUrl.startsWith('http')) {
        this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl, this.config.chainId, {
          staticNetwork: true,
        });

        const key = this.config.relayerPrivateKey;
        const isRealKey = key && !key.includes('YOUR_') && key.length >= 64;

        if (isRealKey) {
          const cleanKey = key.startsWith('0x') ? key : '0x' + key;
          this.wallet = new ethers.Wallet(cleanKey, this.provider);
          this.contract = new ethers.Contract(this.config.contractAddress, TRUSTFABRIC_FIAT_ANCHOR_ABI, this.wallet);
          this.isConnectedToChain = true;
          this.connectionError = null;
        } else {
          this.isConnectedToChain = false;
          this.connectionError = 'SEPOLIA_RELAYER_PRIVATE_KEY is unconfigured or a placeholder.';
        }
      }
    } catch (err: any) {
      this.isConnectedToChain = false;
      this.connectionError = err.message || 'Failed to initialize Ethers RPC provider';
    }
  }

  private initializeQueue(): void {
    try {
      this.redisConnection = new IORedis(this.config.redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: true,
      });

      this.redisConnection.connect().then(() => {
        this.isRedisConnected = true;
        this.queue = new Queue('trustfabric-anchor-batcher', { connection: this.redisConnection as any });
        this.worker = new Worker('trustfabric-anchor-batcher', async (job) => {
          await this.processQueuedCommitment(job.data);
        }, { connection: this.redisConnection as any, concurrency: 1 });
      }).catch(() => {
        this.isRedisConnected = false;
        // In-memory async worker fallback for tests & environments without Redis
      });
    } catch {
      this.isRedisConnected = false;
    }
  }

  public getHealth(): {
    status: 'READY' | 'DEGRADED' | 'UNCONFIGURED';
    chainId: number;
    rpcUrl: string;
    relayerAddress: string;
    contractAddress: string;
    isConnectedToChain: boolean;
    isRedisConnected: boolean;
    pendingQueueLength: number;
    totalBatchesProcessed: number;
    error: string | null;
  } {
    let status: 'READY' | 'DEGRADED' | 'UNCONFIGURED' = 'READY';
    if (!this.isConnectedToChain) {
      status = 'UNCONFIGURED';
    } else if (!this.isRedisConnected) {
      status = 'DEGRADED';
    }

    return {
      status,
      chainId: this.config.chainId,
      rpcUrl: this.config.rpcUrl,
      relayerAddress: this.config.relayerAddress,
      contractAddress: this.config.contractAddress,
      isConnectedToChain: this.isConnectedToChain,
      isRedisConnected: this.isRedisConnected,
      pendingQueueLength: this.pendingBatchQueue.length,
      totalBatchesProcessed: this.batches.size,
      error: this.connectionError,
    };
  }

  /**
   * Enqueue a new commitment for Merkle batching and on-chain anchoring
   */
  public async enqueueCommitment(input: {
    ownerId: string;
    organizationId?: string;
    evidenceDigest: string;
    idempotencyKey: string;
  }): Promise<QueuedCommitment> {
    // 1. Idempotency validation
    const existingId = this.idempotencyIndex.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.commitments.get(existingId);
      if (existing) return existing;
    }

    // 2. Validate evidence digest
    const digest = input.evidenceDigest.startsWith('0x')
      ? input.evidenceDigest
      : '0x' + input.evidenceDigest;

    if (digest.length !== 66) {
      throw new Error(`Invalid evidence digest length ${digest.length}. Expected 32-byte hex hash (66 characters including 0x).`);
    }

    const commitmentId = `anc-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const record: QueuedCommitment = {
      id: commitmentId,
      ownerId: input.ownerId,
      organizationId: input.organizationId,
      evidenceDigest: digest,
      idempotencyKey: input.idempotencyKey,
      status: 'QUEUED',
      createdAt: now,
      updatedAt: now,
    };

    this.commitments.set(commitmentId, record);
    this.idempotencyIndex.set(input.idempotencyKey, commitmentId);
    this.pendingBatchQueue.push(record);

    // 3. Push to Redis BullMQ pipeline for durable persistence
    if (this.queue && this.isRedisConnected) {
      try {
        await this.queue.add('anchor_submission', record, { jobId: record.id });
      } catch {
        // Fallback to in-process batcher
        this.scheduleBatchFlush();
      }
    } else {
      // In-memory queue aggregator
      this.scheduleBatchFlush();
    }

    return record;
  }

  private async processQueuedCommitment(record: QueuedCommitment): Promise<void> {
    // If not already in pending batch queue, add it
    if (!this.pendingBatchQueue.some((c) => c.id === record.id)) {
      this.pendingBatchQueue.push(record);
    }
    if (this.pendingBatchQueue.length >= this.config.maxBatchSize) {
      await this.flushBatch();
    } else {
      this.scheduleBatchFlush();
    }
  }

  private scheduleBatchFlush(): void {
    if (this.batchFlushTimer) return;

    this.batchFlushTimer = setTimeout(async () => {
      this.batchFlushTimer = null;
      await this.flushBatch();
    }, this.config.batchWaitMs);
  }

  /**
   * Flushes current pending commitments into a Merkle tree batch
   */
  public async flushBatch(): Promise<ConfirmedMerkleBatch | null> {
    if (this.batchFlushTimer) {
      clearTimeout(this.batchFlushTimer);
      this.batchFlushTimer = null;
    }

    if (this.pendingBatchQueue.length === 0) {
      return null;
    }

    // Drain up to maxBatchSize
    const batchItems = this.pendingBatchQueue.splice(0, this.config.maxBatchSize);
    const batchId = `batch-${crypto.randomUUID()}`;
    const batchIdHash = ethers.keccak256(ethers.toUtf8Bytes(batchId));

    // Update status to BATCHING
    for (const item of batchItems) {
      item.status = 'BATCHING';
      item.batchId = batchId;
      item.updatedAt = new Date().toISOString();
    }

    // 1. Build deterministic Merkle tree
    const leafInputs: MerkleLeaf[] = batchItems.map((c) => ({
      commitmentId: c.id,
      evidenceDigest: c.evidenceDigest,
      ownerAddress: c.ownerId,
    }));

    const tree = new DeterministicMerkleTree(leafInputs);
    const merkleRoot = tree.getRoot();

    // 2. Generate inclusion proofs for all leaves
    const leavesMap = new Map<string, { leafIndex: number; leafDigest: string; proof: string[] }>();
    for (let i = 0; i < batchItems.length; i++) {
      const proofResult = tree.getProof(i);
      leavesMap.set(batchItems[i].id, {
        leafIndex: i,
        leafDigest: proofResult.leafHash,
        proof: proofResult.proof,
      });
    }

    const now = new Date().toISOString();
    const batchRecord: ConfirmedMerkleBatch = {
      id: batchId,
      batchIdHash,
      merkleRoot,
      leafCount: batchItems.length,
      status: 'SUBMITTED',
      submissionAttempts: 1,
      chainId: this.config.chainId,
      contractAddress: this.config.contractAddress,
      createdAt: now,
      updatedAt: now,
      leaves: leavesMap,
    };
    this.batches.set(batchId, batchRecord);

    // 3. Submit transaction via single-coordinator nonce manager
    await this.executeRelayerSubmission(batchRecord, batchItems);

    return batchRecord;
  }

  /**
   * Executes the blockchain transaction with strict sequential nonce protection
   */
  private async executeRelayerSubmission(
    batch: ConfirmedMerkleBatch,
    items: QueuedCommitment[]
  ): Promise<void> {
    // Acquire mutex lock so no two batches broadcast concurrently on the same relayer account
    const releaseLock = await this.acquireNonceLock();

    try {
      // Mark items as PENDING broadcast
      for (const item of items) {
        item.status = 'PENDING';
        item.updatedAt = new Date().toISOString();
      }

      if (this.wallet && this.contract && this.isConnectedToChain) {
        // --- REAL LIVE ETHEREUM SEPOLIA BROADCAST ---
        const nonce = await this.getNextSafeNonce();
        const tx = await this.contract.recordBatchMerkleRoot(
          batch.batchIdHash,
          batch.merkleRoot,
          batch.leafCount,
          { nonce }
        );

        const receipt = await tx.wait(this.config.confirmations);
        if (receipt && receipt.status === 1) {
          batch.status = 'CONFIRMED';
          batch.txHash = receipt.hash;
          batch.blockNumber = receipt.blockNumber;
          batch.gasUsed = Number(receipt.gasUsed);
          batch.confirmedAt = new Date().toISOString();

          const explorerUrl = `${this.config.etherscanBaseUrl}/tx/${receipt.hash}`;

          for (const item of items) {
            item.status = 'CONFIRMED';
            item.txHash = receipt.hash;
            item.explorerUrl = explorerUrl;
            item.updatedAt = new Date().toISOString();
          }
        } else {
          throw new Error('Transaction reverted on-chain.');
        }
      } else {
        // --- PRODUCTION FAIL-CLOSED TRUTH-IN-LABELING ---
        // As explicitly required: "No fake transaction hashes, hardcoded block numbers,
        // simulated success responses, or automatic mock fallbacks are allowed in production paths."
        // Fail closed with clear audit reason when real key is not yet supplied by user.
        batch.status = 'FAILED';
        const failureReason = this.connectionError || 'Sepolia Relayer private key not supplied; live broadcast refused.';

        for (const item of items) {
          item.status = 'FAILED';
          item.failureReason = failureReason;
          item.updatedAt = new Date().toISOString();
        }
      }
    } catch (err: any) {
      batch.status = 'FAILED';
      for (const item of items) {
        item.status = 'FAILED';
        item.failureReason = err.message || 'Blockchain broadcast failure';
        item.updatedAt = new Date().toISOString();
      }
    } finally {
      releaseLock();
    }
  }

  private async acquireNonceLock(): Promise<() => void> {
    let unlockNext: () => void;
    const nextLock = new Promise<void>((resolve) => {
      unlockNext = resolve;
    });

    const previousLock = this.nonceMutex;
    this.nonceMutex = nextLock;

    await previousLock;
    return unlockNext!;
  }

  private async getNextSafeNonce(): Promise<number> {
    if (!this.provider || !this.wallet) {
      throw new Error('Wallet/Provider not initialized');
    }

    const networkNonce = await this.provider.getTransactionCount(this.wallet.address, 'pending');
    if (this.managedNonce === null || networkNonce > this.managedNonce) {
      this.managedNonce = networkNonce;
    } else {
      this.managedNonce += 1;
    }
    return this.managedNonce;
  }

  public getCommitment(id: string): QueuedCommitment | undefined {
    return this.commitments.get(id);
  }

  public getCommitmentByProof(commitmentId: string): {
    commitment: QueuedCommitment;
    batch?: ConfirmedMerkleBatch;
    leafIndex?: number;
    leafDigest?: string;
    proof?: string[];
    merkleRoot?: string;
    verified: boolean;
  } | null {
    const commitment = this.commitments.get(commitmentId);
    if (!commitment || !commitment.batchId) {
      return null;
    }

    const batch = this.batches.get(commitment.batchId);
    if (!batch) {
      return { commitment, verified: false };
    }

    const leafInfo = batch.leaves.get(commitmentId);
    if (!leafInfo) {
      return { commitment, batch, verified: false };
    }

    const verified = DeterministicMerkleTree.verifyProof(
      leafInfo.leafDigest,
      leafInfo.proof,
      batch.merkleRoot
    );

    return {
      commitment,
      batch,
      leafIndex: leafInfo.leafIndex,
      leafDigest: leafInfo.leafDigest,
      proof: leafInfo.proof,
      merkleRoot: batch.merkleRoot,
      verified,
    };
  }

  /**
   * Helper to inspect internal batch count for testing
   */
  public getBatches(): ConfirmedMerkleBatch[] {
    return Array.from(this.batches.values());
  }
}
