import { describe, it, expect } from 'vitest';
import {
  sha256Hex,
  canonicalizeInvoiceFields,
  computeCanonicalCommitment,
  computeExpenseNullifier,
  signCanonicalStatement,
  verifyDeliverySignature,
  computeMerkleRoot,
} from '../services/crypto';

describe('Cryptographic Engine (PS42-R05, PS42-R07, PS42-R16)', () => {
  it('AT-EVID-01: Computes valid SHA-256 byte digest for a payload', async () => {
    const data = 'TrustFabric_Cascade_2026_PS42_Evidence_Payload';
    const hash = await sha256Hex(data);
    expect(hash).toBeDefined();
    expect(hash.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it('AT-EVID-02: Changing one byte alters the SHA-256 digest (Tamper Evident)', async () => {
    const original = 'Invoice INV-1047 Amount: 42500';
    const tampered = 'Invoice INV-1047 Amount: 42501';

    const hash1 = await sha256Hex(original);
    const hash2 = await sha256Hex(tampered);

    expect(hash1).not.toBe(hash2);
  });

  it('AT-EVID-04: Canonicalizes invoice fields according to versioned schema v1.0', async () => {
    const fields = {
      vendorName: '  GreenBuild Supplies Ltd.  ',
      invoiceNumber: 'inv-1047-A',
      totalAmountMinor: 4250000,
      currency: 'inr',
      date: '2026-02-15T09:30:00Z',
    };

    const canonical = canonicalizeInvoiceFields(fields);
    expect(canonical).toBe('SCHEMA:v1.0|VENDOR:GREENBUILD SUPPLIES LTD.|INV:INV-1047-A|AMT:4250000|CURR:INR|DATE:2026-02-15');

    const commitment = await computeCanonicalCommitment(fields);
    expect(commitment.length).toBe(64);
  });

  it('PS42-R16: Generates deterministic privacy-preserving expense nullifiers', async () => {
    const fieldsA = {
      vendorName: 'GreenBuild Supplies',
      invoiceNumber: 'INV-1047',
      totalAmountMinor: 4250000,
      currency: 'INR',
      date: '2026-02-15',
    };

    const fieldsB = {
      vendorName: 'greenbuild supplies ',
      invoiceNumber: 'inv-1047',
      totalAmountMinor: 4250000,
      currency: 'inr',
      date: '2026-02-15',
    };

    const nullifierA = await computeExpenseNullifier(fieldsA);
    const nullifierB = await computeExpenseNullifier(fieldsB);

    // Identical normalized invoices yield identical nullifiers
    expect(nullifierA).toBe(nullifierB);
    // Nullifier does not leak raw plaintext vendor or invoice number
    expect(nullifierA.includes('GreenBuild')).toBe(false);
    expect(nullifierA.includes('INV-1047')).toBe(false);
  });

  it('AT-EVID-06 & AT-EVID-08: Validates digital signature from registered credential', async () => {
    const statement = 'MILESTONE:MS-01|CLAIM:claim-101|STATUS:COMPLETED';
    const nonce = 'NONCE_TEST_10293847';
    const signerKeyId = 'SIGNER_FIELD_OFFICER_01';

    const { signature } = await signCanonicalStatement(statement, nonce, signerKeyId);
    expect(signature).toBeDefined();

    const verifyResult = await verifyDeliverySignature(statement, nonce, signerKeyId, signature);
    expect(verifyResult.isValid).toBe(true);
    expect(verifyResult.reason).toContain('Cryptographic signature is valid');
  });

  it('AT-EVID-06: Rejects altered payload or forged signature', async () => {
    const statement = 'MILESTONE:MS-01|CLAIM:claim-101|STATUS:COMPLETED';
    const nonce = 'NONCE_TEST_10293847';
    const signerKeyId = 'SIGNER_FIELD_OFFICER_01';

    const { signature } = await signCanonicalStatement(statement, nonce, signerKeyId);

    // Altered statement
    const alteredStatement = 'MILESTONE:MS-01|CLAIM:claim-101|STATUS:FORGED_CLAIM';
    const resultAltered = await verifyDeliverySignature(alteredStatement, nonce, signerKeyId, signature);
    expect(resultAltered.isValid).toBe(false);
    expect(resultAltered.reason).toContain('Signature mismatch');

    // Unknown signer
    const resultUnknownSigner = await verifyDeliverySignature(statement, nonce, 'UNKNOWN_KEY', signature);
    expect(resultUnknownSigner.isValid).toBe(false);
    expect(resultUnknownSigner.reason).toContain('Unknown or unregistered signer');
  });

  it('AT-EVID-09: Computes Merkle Tree Root commitments', async () => {
    const leaves = [
      await sha256Hex('EVIDENCE_DOC_1'),
      await sha256Hex('EVIDENCE_DOC_2'),
      await sha256Hex('EVIDENCE_DOC_3'),
    ];

    const root = await computeMerkleRoot(leaves);
    expect(root).toBeDefined();
    expect(root.length).toBe(64);
  });
});
