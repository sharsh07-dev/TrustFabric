import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'http';
import crypto from 'crypto';
import app from '../src/index.js';
import { JwtService } from '../src/services/jwtService.js';
import { LiveRelayerPipeline } from '../src/services/liveRelayerPipeline.js';
import { DeterministicMerkleTree } from '../src/services/merkleTree.js';

describe('TrustFabric Live Testnet Relayer & 100 Concurrent Users Pipeline', () => {
  let server: Server;
  let baseUrl: string;
  let authToken: string;
  const relayer = LiveRelayerPipeline.getInstance();

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });

    authToken = JwtService.getInstance().signToken({
      sub: 'usr-loadtest-donor-001',
      email: 'donor.loadtest@trustfabric.org',
      name: 'Load Test Donor',
      role: 'DONOR',
      organizationId: 'org-load-testing',
      permissions: ['DONATION_CREATE', 'ANCHOR_READ'],
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('1. GET /api/anchors/health reports accurate chain and relayer configuration', async () => {
    const res = await fetch(`${baseUrl}/api/anchors/health`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.chainId).toBe(11155111); // Ethereum Sepolia Testnet
    expect(body.relayerAddress).toBeDefined();
    expect(body.contractAddress).toBeDefined();
  });

  it('2. 100 CONCURRENT USERS LOAD TEST: Submits 100 simultaneous commitments and measures throughput & latency', async () => {
    const CONCURRENT_USERS = 100;
    const submissionTimestamps: number[] = [];
    const commitmentsCreated: string[] = [];

    const startTime = performance.now();

    // Fire 100 simultaneous requests via Promise.all
    const promises = Array.from({ length: CONCURRENT_USERS }, async (_, index) => {
      const evidenceDigest = '0x' + crypto.createHash('sha256').update(`evidence-receipt-${index}-${Date.now()}`).digest('hex');
      const idempotencyKey = `idemp-loadtest-${index}-${Date.now()}`;

      const reqStart = performance.now();
      const res = await fetch(`${baseUrl}/api/anchors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          evidenceDigest,
          idempotencyKey,
          organizationId: 'org-jaljeevan-relief',
        }),
      });

      const reqEnd = performance.now();
      submissionTimestamps.push(reqEnd - reqStart);

      expect(res.status).toBe(202);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.commitment.id).toBeDefined();
      commitmentsCreated.push(data.commitment.id);
    });

    await Promise.all(promises);
    const totalTimeMs = performance.now() - startTime;

    // Calculate latency metrics
    submissionTimestamps.sort((a, b) => a - b);
    const p50 = submissionTimestamps[Math.floor(submissionTimestamps.length * 0.50)];
    const p95 = submissionTimestamps[Math.floor(submissionTimestamps.length * 0.95)];
    const p99 = submissionTimestamps[Math.floor(submissionTimestamps.length * 0.99)];
    const throughput = (CONCURRENT_USERS / (totalTimeMs / 1000)).toFixed(1);

    console.log(`\n======================================================`);
    console.log(`🚀 100 CONCURRENT USERS LOAD TEST METRICS`);
    console.log(`- Total Commitments Enqueued: ${CONCURRENT_USERS}`);
    console.log(`- Total Duration:             ${totalTimeMs.toFixed(2)} ms`);
    console.log(`- Ingress Throughput:         ${throughput} requests/sec`);
    console.log(`- Latency p50:                ${p50.toFixed(2)} ms`);
    console.log(`- Latency p95:                ${p95.toFixed(2)} ms`);
    console.log(`- Latency p99:                ${p99.toFixed(2)} ms`);
    console.log(`- Error Rate:                 0.00% (100/100 accepted)`);
    console.log(`======================================================\n`);

    expect(commitmentsCreated.length).toBe(100);

    // 3. Flush any remaining queued submissions into final batch
    while (true) {
      const batch = await relayer.flushBatch();
      if (!batch) break;
    }

    const allBatches = relayer.getBatches();
    const totalBatchedLeaves = allBatches.reduce((acc, b) => acc + b.leafCount, 0);
    expect(totalBatchedLeaves).toBeGreaterThanOrEqual(100);

    // 4. Verify inclusion proofs mathematically for a sample of the 100 commitments
    const sampleIds = [commitmentsCreated[0], commitmentsCreated[25], commitmentsCreated[50], commitmentsCreated[99]];
    for (const id of sampleIds) {
      const proofRes = await fetch(`${baseUrl}/api/anchors/${id}/proof`);
      expect(proofRes.status).toBe(200);
      const proofData = await proofRes.json();

      expect(proofData.success).toBe(true);
      expect(proofData.verified).toBe(true);
      expect(proofData.merkleRoot).toBeDefined();
      expect(Array.isArray(proofData.proof)).toBe(true);

      // Verify off-chain reconstruction of the Merkle root
      const isValid = DeterministicMerkleTree.verifyProof(
        proofData.leafDigest,
        proofData.proof,
        proofData.merkleRoot
      );
      expect(isValid).toBe(true);
    }
  });

  it('3. Idempotency test: Re-submitting identical idempotencyKey returns existing commitment', async () => {
    const idempotencyKey = `idemp-unique-test-${Date.now()}`;
    const evidenceDigest = '0x' + crypto.createHash('sha256').update('fixed_invoice').digest('hex');

    // First request
    const res1 = await fetch(`${baseUrl}/api/anchors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ evidenceDigest, idempotencyKey }),
    });
    const data1 = await res1.json();
    expect(res1.status).toBe(202);

    // Second request with same idempotency key
    const res2 = await fetch(`${baseUrl}/api/anchors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ evidenceDigest, idempotencyKey }),
    });
    const data2 = await res2.json();
    expect(res2.status).toBe(202);
    expect(data2.commitment.id).toBe(data1.commitment.id);
  });

  it('4. Truth in Labeling: Production fail-closed behavior when live private key is unconfigured', async () => {
    // When SEPOLIA_RELAYER_PRIVATE_KEY is unconfigured, the system must NOT forge fake hashes
    const pipeline = LiveRelayerPipeline.getInstance();
    const health = pipeline.getHealth();

    // Verify system does not lie about chain connection when key is placeholder
    if (!process.env.SEPOLIA_RELAYER_PRIVATE_KEY || process.env.SEPOLIA_RELAYER_PRIVATE_KEY.includes('YOUR_')) {
      expect(health.isConnectedToChain).toBe(false);
      expect(health.error).toBeDefined();
    }
  });
});
