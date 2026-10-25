import { describe, it, expect } from 'vitest';
import { verifyBundle } from '../services/cliVerification';
import { TrustFabricStorage } from '../services/storage';

describe('Standalone Auditor CLI (trustfabric-verify) Tests (P1)', () => {
  async function createCleanMockBundle() {
    const storage = TrustFabricStorage.getInstance();
    const state = await storage.resetToDemoSeed();

    await storage.auditLedger.appendEvent({
      actorRef: 'AUDITOR_01',
      actorRole: 'AUDITOR',
      action: 'GRANT_ALLOCATION_AUDIT',
      entityType: 'GRANT',
      entityId: 'grant-cw-2026-014',
      reason: 'Verified allocation ceiling and purpose bounds.',
    });

    const populatedState = {
      ...state,
      auditEvents: storage.auditLedger.getEvents(),
    };

    return {
      protocol: 'TRUSTFABRIC_FORENSIC_PACKAGE',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      networkMode: 'LOCAL_DEMO_CACHE',
      genesisHash: populatedState.auditEvents[0].eventHash,
      latestAuditHash: populatedState.auditEvents[populatedState.auditEvents.length - 1].eventHash,
      data: populatedState,
    };
  }

  it('validates a clean, untampered export package with 100% mathematical integrity', async () => {
    const bundle = await createCleanMockBundle();
    const result = await verifyBundle(bundle);

    expect(result.isValid).toBe(true);
    expect(result.issues.length).toBe(0);
    expect(result.stats.auditBlocksChecked).toBe(bundle.data.auditEvents.length);
    expect(result.stats.grantsCount).toBe(bundle.data.grants.length);
  });

  it('detects and rejects tampered audit event payload (AT-AUD-03)', async () => {
    const bundle = await createCleanMockBundle();
    // Tamper with reason in event #1 without updating hash
    bundle.data.auditEvents[0].reason = 'MALICIOUS_MODIFICATION_TEST: altered reason';

    const result = await verifyBundle(bundle);
    expect(result.isValid).toBe(false);
    expect(result.issues.some((i: string) => i.includes('Block Hash Mismatch at Block #1'))).toBe(true);
  });

  it('detects severed chain link when a middle audit block is deleted or reordered', async () => {
    const bundle = await createCleanMockBundle();
    // Swap block #1 and #2
    const temp = bundle.data.auditEvents[0];
    bundle.data.auditEvents[0] = bundle.data.auditEvents[1];
    bundle.data.auditEvents[1] = temp;

    const result = await verifyBundle(bundle);
    expect(result.isValid).toBe(false);
    expect(result.issues.some((i: string) => i.includes('Chain Link Severed') || i.includes('Sequence Violation'))).toBe(true);
  });

  it('detects cross-report duplicate nullifier reuse within bundle scope (PS42-R09)', async () => {
    const bundle = await createCleanMockBundle();
    const sharedNullifier = '0xnullifier_collision_detected_cross_report_99';

    // Duplicate nullifier on second document
    const secondDoc = { ...bundle.data.documents[0], id: 'doc-duplicate-test-02', expenseNullifierRef: sharedNullifier };
    bundle.data.documents[0].expenseNullifierRef = sharedNullifier;
    bundle.data.documents.push(secondDoc);

    const result = await verifyBundle(bundle);
    expect(result.isValid).toBe(false);
    expect(result.issues.some((i: string) => i.includes('Expense Nullifier Collision Detected'))).toBe(true);
  });

  it('rejects bundle with invalid protocol identifier', async () => {
    const invalidBundle = {
      protocol: 'UNKNOWN_ATTACK_FORMAT',
      data: {},
    };

    const result = await verifyBundle(invalidBundle);
    expect(result.isValid).toBe(false);
    expect(result.issues[0]).toContain('Invalid protocol identifier');
  });
});
