/**
 * TrustFabric Private Evidence Storage & Processing Service
 * Handles secure file ingestion, server-side SHA-256 computation,
 * field canonicalization, commitment calculation, and private storage isolation.
 * Satisfies PS42-R05, TRD Section 6, AT-EVID-01 to AT-EVID-05.
 */

import { type EvidenceDocument } from '../types/trustfabric';
import {
  sha256Hex,
  computeCanonicalCommitment,
  computeExpenseNullifier,
} from './crypto';

export interface IngestDocumentParams {
  claimId: string;
  filename: string;
  mimeType: string;
  fileBytes: ArrayBuffer | Uint8Array;
  uploadedBy: string;
  extractedFields: {
    vendorName: string;
    invoiceNumber: string;
    date: string;
    totalAmountMinor: number;
    currency: string;
    lineItems?: Array<{ description: string; amountMinor: number }>;
    isOcrExtracted: boolean;
  };
  issuerSignatureRef?: string;
}

export class EvidenceService {
  private documentStore: Map<string, { doc: EvidenceDocument; rawBytes: Uint8Array }> = new Map();
  private maxSizeBytes = 10 * 1024 * 1024; // 10MB limit (AT-SEC-04)
  private allowedMimeTypes = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

  public getDocuments(): EvidenceDocument[] {
    return Array.from(this.documentStore.values()).map(item => item.doc);
  }

  public getDocumentById(id: string): EvidenceDocument | undefined {
    return this.documentStore.get(id)?.doc;
  }

  public getDocumentByClaimId(claimId: string): EvidenceDocument | undefined {
    for (const item of this.documentStore.values()) {
      if (item.doc.claimId === claimId) return item.doc;
    }
    return undefined;
  }

  /**
   * Securely ingests an evidence file with server-side validation and SHA-256 computation
   */
  public async ingestDocument(params: IngestDocumentParams): Promise<{
    document: EvidenceDocument;
    canonicalCommitment: string;
    expenseNullifier: string;
  }> {
    // 1. Validation checks
    const bytes = params.fileBytes instanceof Uint8Array
      ? params.fileBytes
      : new Uint8Array(params.fileBytes);

    if (bytes.length > this.maxSizeBytes) {
      throw new Error(`File size ${bytes.length} bytes exceeds 10MB security limit.`);
    }

    if (!this.allowedMimeTypes.has(params.mimeType.toLowerCase())) {
      throw new Error(`MIME type "${params.mimeType}" is not permitted. Only PDF and JPEG/PNG/WebP are allowed.`);
    }

    // 2. Compute exact file SHA-256 digest on server/runtime
    const sha256 = await sha256Hex(bytes);

    // 3. Compute Canonical Commitment
    const canonicalCommitment = await computeCanonicalCommitment(params.extractedFields);

    // 4. Compute Privacy-Preserving Expense Nullifier
    const expenseNullifier = await computeExpenseNullifier(params.extractedFields);

    // 5. Build Document Record with opaque private storage key
    const docId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const storageKey = `vault://private_evidence/${params.claimId}/${docId}/${params.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const document: EvidenceDocument = {
      id: docId,
      claimId: params.claimId,
      filename: params.filename,
      storageKey,
      mimeType: params.mimeType,
      sizeBytes: bytes.length,
      sha256,
      canonicalCommitment,
      expenseNullifierRef: expenseNullifier,
      extractedFields: params.extractedFields,
      issuerSignatureRef: params.issuerSignatureRef,
      verificationStatus: 'EVIDENCE_LINKED',
      uploadedBy: params.uploadedBy,
      uploadedAt: new Date().toISOString(),
    };

    // Store in private vault
    this.documentStore.set(docId, { doc: document, rawBytes: bytes });

    return {
      document,
      canonicalCommitment,
      expenseNullifier,
    };
  }

  /**
   * Verifies file integrity against a previously recorded digest
   */
  public async verifyFileIntegrity(docId: string, currentBytes: ArrayBuffer | Uint8Array): Promise<boolean> {
    const item = this.documentStore.get(docId);
    if (!item) return false;

    const currentHash = await sha256Hex(currentBytes);
    return currentHash === item.doc.sha256;
  }
}
