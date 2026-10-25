/**
 * TrustFabric Cryptographic Append-Only Audit Ledger
 * Implements tamper-evident audit hashing, sequential verification, and chain integrity checking.
 * Satisfies TRD Section 4, AT-AUD-01 to AT-AUD-04.
 */

import { type AuditEvent, type UserRole } from '../types/trustfabric';
import { sha256Hex } from './crypto';

const GENESIS_PREV_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export class AuditLedgerService {
  private events: AuditEvent[] = [];

  constructor(initialEvents?: AuditEvent[]) {
    if (initialEvents && initialEvents.length > 0) {
      this.events = [...initialEvents];
    }
  }

  public getEvents(): AuditEvent[] {
    return [...this.events];
  }

  /**
   * Appends an immutable, cryptographically chained audit event.
   */
  public async appendEvent(params: {
    actorRef: string;
    actorRole: UserRole;
    action: string;
    entityType: string;
    entityId: string;
    reason: string;
    sourceRef?: string;
    beforeHash?: string;
    afterHash?: string;
    customTimestamp?: string;
  }): Promise<AuditEvent> {
    const sequence = this.events.length + 1;
    const prevEventHash = this.events.length > 0
      ? this.events[this.events.length - 1].eventHash
      : GENESIS_PREV_HASH;

    const timestamp = params.customTimestamp || new Date().toISOString();

    const hashPayload = [
      sequence.toString(),
      prevEventHash,
      params.actorRef,
      params.action,
      params.entityType,
      params.entityId,
      timestamp,
      params.reason,
      params.beforeHash || '',
      params.afterHash || '',
    ].join('|');

    const eventHash = await sha256Hex(hashPayload);

    const newEvent: AuditEvent = {
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sequence,
      actorRef: params.actorRef,
      actorRole: params.actorRole,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      timestamp,
      reason: params.reason,
      beforeHash: params.beforeHash,
      afterHash: params.afterHash,
      prevEventHash,
      eventHash,
      sourceRef: params.sourceRef || 'TRUSTFABRIC_NODE_CORE',
    };

    this.events.push(newEvent);
    return newEvent;
  }

  /**
   * Verifies the cryptographic integrity of the entire audit chain.
   * Returns isValid: true if all hashes and sequential links are untampered.
   */
  public async verifyChainIntegrity(): Promise<{
    isValid: boolean;
    totalEvents: number;
    brokenEventSequence?: number;
    reason: string;
  }> {
    if (this.events.length === 0) {
      return { isValid: true, totalEvents: 0, reason: 'Audit ledger is empty (genesis state).' };
    }

    let expectedPrevHash = GENESIS_PREV_HASH;

    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i];
      const expectedSequence = i + 1;

      if (event.sequence !== expectedSequence) {
        return {
          isValid: false,
          totalEvents: this.events.length,
          brokenEventSequence: event.sequence,
          reason: `Sequence violation at index ${i}: expected #${expectedSequence}, got #${event.sequence}.`,
        };
      }

      if (event.prevEventHash !== expectedPrevHash) {
        return {
          isValid: false,
          totalEvents: this.events.length,
          brokenEventSequence: event.sequence,
          reason: `Broken chain link at event #${event.sequence}: prevEventHash mismatch. Record was tampered or inserted.`,
        };
      }

      // Recompute hash
      const hashPayload = [
        event.sequence.toString(),
        event.prevEventHash,
        event.actorRef,
        event.action,
        event.entityType,
        event.entityId,
        event.timestamp,
        event.reason,
        event.beforeHash || '',
        event.afterHash || '',
      ].join('|');

      const computedHash = await sha256Hex(hashPayload);

      if (computedHash !== event.eventHash) {
        return {
          isValid: false,
          totalEvents: this.events.length,
          brokenEventSequence: event.sequence,
          reason: `Hash mismatch at event #${event.sequence}: event body was modified after appending.`,
        };
      }

      expectedPrevHash = event.eventHash;
    }

    return {
      isValid: true,
      totalEvents: this.events.length,
      reason: `Cryptographic audit integrity verified: all ${this.events.length} block hashes are mathematically valid and sequentially linked.`,
    };
  }

  /**
   * Deliberately mutates a record for adversarial testing (AT-AUD-03)
   */
  public tamperWithEventForTesting(sequence: number, newReason: string): void {
    const target = this.events.find(e => e.sequence === sequence);
    if (target) {
      target.reason = newReason; // Changes payload without updating eventHash or next link
    }
  }
}
