import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'http';
import crypto from 'crypto';
import { ethers } from 'ethers';
import app from '../src/index.js';
import { JwtService } from '../src/services/jwtService.js';
import { IpfsStorageService, type BatchManifest } from '../src/services/ipfsStorageService.js';
import { EvidenceVaultService } from '../src/services/evidenceVaultService.js';
import { SupabaseToIpfsMigrator } from '../src/scripts/migrateSupabaseToIpfs.js';
import { DeterministicMerkleTree, type MerkleLeaf } from '../src/services/merkleTree.js';

describe('TrustFabric Decentralized IPFS Storage & Migration Test Suite', () => {
  let server: Server;
  let baseUrl: string;
  let adminToken: string;
  let auditorToken: string;
  let donorToken: string;
  let fieldWorkerOrgA: string;
  let fieldWorkerOrgB: string;

  let ipfsService: IpfsStorageService;
  let vaultService: EvidenceVaultService;

  beforeAll(async () => {
    ipfsService = IpfsStorageService.getInstance();
    vaultService = EvidenceVaultService.getInstance();

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });

    const jwt = JwtService.getInstance();

    adminToken = jwt.signToken({
      sub: 'usr-admin-ipfs-001',
      email: 'admin@trustfabric.org',
      name: 'System Admin',
      role: 'ADMIN',
      organizationId: 'org-trustfabric',
      permissions: ['ALL'],
    });

    auditorToken = jwt.signToken({
      sub: 'usr-auditor-ipfs-002',
      email: 'auditor@audit.org',
      name: 'Lead Auditor',
      role: 'AUDITOR',
      organizationId: 'org-auditors',
      permissions: ['AUDIT_READ'],
    });

    donorToken = jwt.signToken({
      sub: 'usr-donor-ipfs-003',
      email: 'donor@example.org',
      name: 'Public Donor',
      role: 'DONOR',
      organizationId: 'org-donors',
      permissions: ['DONATE'],
    });

    fieldWorkerOrgA = jwt.signToken({
      sub: 'usr-worker-orga-004',
      email: 'worker@water.org',
      name: 'Field Worker A',
      role: 'FIELD_WORKER',
      organizationId: 'org-clean-water',
      permissions: ['EXPENSE_SUBMIT'],
    });

    fieldWorkerOrgB = jwt.signToken({
      sub: 'usr-worker-orgb-005',
      email: 'worker@solar.org',
      name: 'Field Worker B',
      role: 'FIELD_WORKER',
      organizationId: 'org-rural-solar',
      permissions: ['EXPENSE_SUBMIT'],
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe('1. Cryptographic CID Generation and Validation', () => {
    it('generates canonical CIDv1 and CIDv0 for file content', () => {
      const buffer = Buffer.from('TrustFabric Public Verification Evidence Document 2026');
      const cidV1 = ipfsService.computeCid(buffer, 'v1');
      const cidV0 = ipfsService.computeCid(buffer, 'v0');

      expect(cidV1.startsWith('bafk') || cidV1.startsWith('bafy')).toBe(true);
      expect(cidV0.startsWith('Qm')).toBe(true);

      expect(ipfsService.isValidCid(cidV1)).toBe(true);
      expect(ipfsService.isValidCid(cidV0)).toBe(true);
    });

    it('rejects invalid or malformed CID formats', () => {
      expect(ipfsService.isValidCid('')).toBe(false);
      expect(ipfsService.isValidCid('0x1234567890abcdef')).toBe(false);
      expect(ipfsService.isValidCid('QmShort')).toBe(false);
      expect(ipfsService.isValidCid('bafk!invalid_characters')).toBe(false);
    });

    it('verifies content integrity against expected CID', () => {
      const original = Buffer.from('Audit Certificate #99102 Genuine');
      const cid = ipfsService.computeCid(original, 'v1');

      expect(ipfsService.verifyContentIntegrity(original, cid)).toBe(true);

      // Mutated bytes must fail verification
      const mutated = Buffer.from('Audit Certificate #99102 Tampered');
      expect(ipfsService.verifyContentIntegrity(mutated, cid)).toBe(false);
    });
  });

  describe('2. IPFS Storage Upload & Retrieval', () => {
    it('uploads file buffer, pins to vault, and provides verifiable retrieval', async () => {
      const fileContent = Buffer.from('%PDF-1.4 Borewell Drilling Invoiced Delivery Receipt #4401');
      const result = await ipfsService.uploadFile({
        buffer: fileContent,
        filename: 'borewell_receipt_4401.pdf',
        mimeType: 'application/pdf',
      });

      expect(result.cid).toBeDefined();
      expect(result.sizeBytes).toBe(fileContent.length);
      expect(result.pinned).toBe(true);
      expect(result.gatewayUrl).toContain(result.cid);

      // Verify immediate retrieval
      const fetched = await ipfsService.fetchFile(result.cid);
      expect(fetched.toString()).toBe(fileContent.toString());
      expect(ipfsService.isPinned(result.cid)).toBe(true);
    });

    it('uploads and retrieves structured JSON metadata', async () => {
      const campaignMetadata = {
        campaignId: 'CW-2026-CLEANWATER',
        title: 'Clean Water for Rural Schools',
        targetAmountInr: 2500000,
        ngoDarpanId: 'DL/2026/09912',
        evidenceDocumentsCount: 14,
        createdAt: new Date().toISOString(),
      };

      const result = await ipfsService.uploadJson(campaignMetadata, 'campaign_cw_2026');
      expect(result.cid).toBeDefined();

      const retrieved = await ipfsService.fetchJson(result.cid);
      expect(retrieved.campaignId).toBe(campaignMetadata.campaignId);
      expect(retrieved.title).toBe(campaignMetadata.title);
      expect(retrieved.targetAmountInr).toBe(2500000);
    });

    it('rejects empty file uploads with 400 Empty File', async () => {
      await expect(
        ipfsService.uploadFile({
          buffer: Buffer.alloc(0),
          filename: 'empty.pdf',
          mimeType: 'application/pdf',
        })
      ).rejects.toThrow('Cannot upload empty file to IPFS.');
    });

    it('rejects oversized file uploads exceeding 10MB', async () => {
      const oversized = Buffer.alloc(10 * 1024 * 1024 + 1);
      await expect(
        ipfsService.uploadFile({
          buffer: oversized,
          filename: 'oversized.pdf',
          mimeType: 'application/pdf',
        })
      ).rejects.toThrow('exceeds maximum IPFS upload limit');
    });
  });

  describe('3. Evidence Vault Integration with IPFS', () => {
    it('POST /api/evidence/upload stores to IPFS and returns ipfsCid in record', async () => {
      const fileContent = Buffer.from('%PDF-1.4 Vendor Invoice Solar Panels #9921');
      const res = await fetch(`${baseUrl}/api/evidence/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${fieldWorkerOrgA}`,
        },
        body: JSON.stringify({
          originalFilename: 'Solar_Panels_9921.pdf',
          mimeType: 'application/pdf',
          fileBase64: fileContent.toString('base64'),
          organizationId: 'org-clean-water',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.evidence.storageProvider).toBe('ipfs_storage');
      expect(body.evidence.ipfsCid).toBeDefined();
      expect(body.evidence.ipfsCid.startsWith('bafk')).toBe(true);
      expect(body.evidence.ipfsGatewayUrl).toBeDefined();
    });

    it('GET /api/evidence/:id/ipfs returns IPFS metadata for authorized users', async () => {
      // Upload evidence
      const fileContent = Buffer.from('%PDF-1.4 Water Filter Pipeline Report #332');
      const uploadRes = await fetch(`${baseUrl}/api/evidence/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${fieldWorkerOrgA}`,
        },
        body: JSON.stringify({
          originalFilename: 'Pipeline_Report_332.pdf',
          mimeType: 'application/pdf',
          fileBase64: fileContent.toString('base64'),
          organizationId: 'org-clean-water',
        }),
      });
      const { evidence } = await uploadRes.json();

      // Query IPFS metadata as Auditor
      const ipfsRes = await fetch(`${baseUrl}/api/evidence/${evidence.id}/ipfs`, {
        headers: { Authorization: `Bearer ${auditorToken}` },
      });
      expect(ipfsRes.status).toBe(200);
      const ipfsBody = await ipfsRes.json();

      expect(ipfsBody.success).toBe(true);
      expect(ipfsBody.ipfsCid).toBe(evidence.ipfsCid);
      expect(ipfsBody.storageProvider).toBe('ipfs_storage');
      expect(ipfsBody.isPinned).toBe(true);
      expect(ipfsBody.gatewayUrl).toContain(evidence.ipfsCid);
    });

    it('enforces RBAC: DONOR cannot query IPFS evidence metadata', async () => {
      const ipfsRes = await fetch(`${baseUrl}/api/evidence/any-id/ipfs`, {
        headers: { Authorization: `Bearer ${donorToken}` },
      });
      expect(ipfsRes.status).toBe(403);
    });

    it('enforces cross-organization access boundary on IPFS metadata', async () => {
      // Document belongs to Org A
      const fileContent = Buffer.from('%PDF-1.4 Org A Internal Evidence');
      const uploadRes = await fetch(`${baseUrl}/api/evidence/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${fieldWorkerOrgA}`,
        },
        body: JSON.stringify({
          originalFilename: 'OrgA_Internal.pdf',
          mimeType: 'application/pdf',
          fileBase64: fileContent.toString('base64'),
          organizationId: 'org-clean-water',
        }),
      });
      const { evidence } = await uploadRes.json();

      // Org B worker tries to access -> 403 Forbidden
      const crossRes = await fetch(`${baseUrl}/api/evidence/${evidence.id}/ipfs`, {
        headers: { Authorization: `Bearer ${fieldWorkerOrgB}` },
      });
      expect(crossRes.status).toBe(403);
    });
  });

  describe('4. Blockchain Merkle Batch & IPFS Manifest Linking', () => {
    it('creates on-chain Merkle root and generates public IPFS Batch Manifest', async () => {
      // 1. Upload 3 simulated receipts to IPFS
      const items = [
        { id: 'commit-001', data: 'Borewell Pump #1 Invoice' },
        { id: 'commit-002', data: 'Water Testing Lab Report' },
        { id: 'commit-003', data: 'PVC Pipeline Fittings Bill' },
      ];

      const leaves: MerkleLeaf[] = [];
      const manifestLeaves: any[] = [];

      for (const item of items) {
        const buf = Buffer.from(item.data);
        const ipfsResult = await ipfsService.uploadFile({
          buffer: buf,
          filename: `${item.id}.pdf`,
          mimeType: 'application/pdf',
        });

        // Compute 32-byte evidence digest from the IPFS CID
        const evidenceDigest = ethers.keccak256(ethers.toUtf8Bytes(ipfsResult.cid));

        leaves.push({
          commitmentId: item.id,
          evidenceDigest,
          ownerAddress: '0x1234567890123456789012345678901234567890',
        });

        manifestLeaves.push({
          commitmentId: item.id,
          ipfsCid: ipfsResult.cid,
          evidenceDigest,
          sha256: ipfsResult.sha256,
        });
      }

      // 2. Compute Merkle root off-chain
      const tree = new DeterministicMerkleTree(leaves);
      const root = tree.getRoot();
      const batchId = ethers.keccak256(ethers.toUtf8Bytes(`BATCH-${Date.now()}`));

      // 3. Assemble and upload Batch Manifest to IPFS
      const manifest: BatchManifest = {
        manifestVersion: '1.0.0',
        batchId,
        merkleRoot: root,
        leafCount: leaves.length,
        relayerAddress: '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
        network: 'Ethereum Sepolia',
        chainId: 11155111,
        createdAt: new Date().toISOString(),
        leaves: manifestLeaves,
      };

      const manifestResult = await ipfsService.uploadJson(manifest, `batch_${batchId.slice(0, 10)}`);
      expect(manifestResult.cid).toBeDefined();

      // 4. Retrieve and verify manifest integrity
      const retrievedManifest = await ipfsService.fetchJson<BatchManifest>(manifestResult.cid);
      expect(retrievedManifest.merkleRoot).toBe(root);
      expect(retrievedManifest.leaves.length).toBe(3);

      // 5. Re-verify Merkle inclusion proof for each leaf in manifest
      for (let i = 0; i < leaves.length; i++) {
        const proof = tree.getProof(i);
        const valid = DeterministicMerkleTree.verifyProof(proof.leafHash, proof.proof, root);
        expect(valid).toBe(true);
      }
    });
  });

  describe('5. Supabase to IPFS Migration & Rollback Engine', () => {
    it('executes migration, maintains mapping, and supports safe rollback', async () => {
      const migrator = new SupabaseToIpfsMigrator();

      // Run migration
      const report = await migrator.migrate();
      expect(report.status).toBe('COMPLETED');
      expect(report.items).toBeDefined();

      for (const item of report.items) {
        expect(item.newProvider).toBe('ipfs_storage');
        expect(item.ipfsCid).toBeDefined();
        expect(item.verified).toBe(true);
      }

      // Verify migration audit ledger is persisted on disk
      const ledger = migrator.getMigrationLedger();
      expect(ledger).not.toBeNull();
      expect(ledger?.status).toBe('COMPLETED');

      // Test safe rollback
      const rollbackResult = await migrator.rollback();
      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.totalRolledBack).toBe(report.items.length);

      // Verify ledger updated to ROLLED_BACK
      const rolledBackLedger = migrator.getMigrationLedger();
      expect(rolledBackLedger?.status).toBe('ROLLED_BACK');

      // Re-run migration to restore IPFS-primary state
      const reMigrateReport = await migrator.migrate();
      expect(reMigrateReport.status).toBe('COMPLETED');
    });
  });

  describe('6. Public Manifest & Raw CID Fetch Endpoints', () => {
    it('POST /api/evidence/ipfs/upload-manifest uploads public manifest', async () => {
      const manifestData = {
        title: 'Public Audit Package Q1 2026',
        auditor: 'Auditor General Independent Trust Review',
        grantsEvaluated: ['CW-2026-014', 'SL-2026-009'],
        anomaliesDetected: 0,
        tamperedCids: 0,
      };

      const res = await fetch(`${baseUrl}/api/evidence/ipfs/upload-manifest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auditorToken}`,
        },
        body: JSON.stringify({
          manifest: manifestData,
          name: 'audit_package_q1_2026',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.cid).toBeDefined();

      // Retrieve via GET /api/evidence/ipfs/fetch/:cid
      const fetchRes = await fetch(`${baseUrl}/api/evidence/ipfs/fetch/${body.cid}`);
      expect(fetchRes.status).toBe(200);
      expect(fetchRes.headers.get('x-ipfs-cid')).toBe(body.cid);
      const parsed = JSON.parse(await fetchRes.text());
      expect(parsed.title).toBe(manifestData.title);
    });

    it('GET /api/evidence/ipfs/fetch/:cid returns 400 for invalid CID', async () => {
      const res = await fetch(`${baseUrl}/api/evidence/ipfs/fetch/invalid-cid-format`);
      expect(res.status).toBe(400);
    });
  });
});
