import { describe, it, expect } from 'vitest';
import { AuditLedgerService } from '../services/auditLedger';

describe('Audit Ledger Hash Chain (AT-AUD-01 to AT-AUD-04)', () => {
  it('AT-AUD-01: Appends cryptographically chained events and verifies intact chain', async () => {
    const audit = new AuditLedgerService();

    await audit.appendEvent({
      actorRef: 'ADMIN_01',
      actorRole: 'ADMIN',
      action: 'CREATE_GRANT',
      entityType: 'GRANT',
      entityId: 'CW-2026-014',
      reason: 'Created clean water grant',
    });

    await audit.appendEvent({
      actorRef: 'FINANCE_OFFICER',
      actorRole: 'FINANCE_OFFICER',
      action: 'ALLOCATE_BUDGET',
      entityType: 'ALLOCATION',
      entityId: 'alloc-01',
      reason: 'Allocated ₹3,50,000 to Water Infrastructure',
    });

    await audit.appendEvent({
      actorRef: 'PROTOCOL_ENGINE',
      actorRole: 'ADMIN',
      action: 'COMMIT_EVIDENCE',
      entityType: 'DOCUMENT',
      entityId: 'doc-inv-1047',
      reason: 'Committed SHA-256 evidence hash',
    });

    expect(audit.getEvents().length).toBe(3);

    // Verify cryptographic integrity
    const verifyResult = await audit.verifyChainIntegrity();
    expect(verifyResult.isValid).toBe(true);
    expect(verifyResult.totalEvents).toBe(3);
    expect(verifyResult.reason).toContain('Cryptographic audit integrity verified');
  });

  it('AT-AUD-03: Detects tampering in an event block and pinpoints sequence mismatch', async () => {
    const audit = new AuditLedgerService();

    await audit.appendEvent({
      actorRef: 'ADMIN_01',
      actorRole: 'ADMIN',
      action: 'CREATE_GRANT',
      entityType: 'GRANT',
      entityId: 'CW-2026-014',
      reason: 'Initial authentic reason',
    });

    await audit.appendEvent({
      actorRef: 'AUDITOR',
      actorRole: 'AUDITOR',
      action: 'VERIFY_DELIVERY',
      entityType: 'DELIVERY',
      entityId: 'att-01',
      reason: 'Field attested',
    });

    // Deliberately tamper with event #1
    audit.tamperWithEventForTesting(1, 'ALTERED_REASON_MALICIOUS_INJECTION');

    // Verification must fail!
    const verifyResult = await audit.verifyChainIntegrity();
    expect(verifyResult.isValid).toBe(false);
    expect(verifyResult.brokenEventSequence).toBe(1);
    expect(verifyResult.reason).toContain('Hash mismatch');
  });
});
