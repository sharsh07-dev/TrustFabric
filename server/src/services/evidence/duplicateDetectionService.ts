import type { OcrExtractionResult } from '../ocr/ocrEngine.js';

export type DuplicateStatus = 'NO_MATCH_FOUND' | 'POSSIBLE_DUPLICATE' | 'CONFIRMED_DUPLICATE' | 'UNRESOLVED';

export interface DuplicateCandidate {
  collidingEvidenceId: string;
  matchType: 'EXACT_HASH' | 'INVOICE_FIELDS_MATCH' | 'FUZZY_VENDOR_MATCH';
  matchingFields: Record<string, any>;
  rule: string;
  detectedAt: string;
}

export interface DuplicateDetectionResult {
  status: DuplicateStatus;
  candidates: DuplicateCandidate[];
  checkedCount: number;
  notes: string;
}

export interface ExistingEvidenceRecord {
  id: string;
  sha256: string;
  organizationId: string;
  vendorName?: string;
  vendorGstin?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  totalAmountPaise?: number;
}

export class DuplicateDetectionService {
  private static instance: DuplicateDetectionService;

  public static getInstance(): DuplicateDetectionService {
    if (!DuplicateDetectionService.instance) {
      DuplicateDetectionService.instance = new DuplicateDetectionService();
    }
    return DuplicateDetectionService.instance;
  }

  /**
   * Evaluates incoming evidence against existing evidence records
   */
  public checkDuplicates(params: {
    evidenceId: string;
    sha256: string;
    organizationId: string;
    extraction?: OcrExtractionResult;
    existingRecords: ExistingEvidenceRecord[];
    isCrossOrgAllowed?: boolean;
  }): DuplicateDetectionResult {
    const { evidenceId, sha256, organizationId, extraction, existingRecords, isCrossOrgAllowed } = params;

    const candidates: DuplicateCandidate[] = [];
    const now = new Date().toISOString();

    const incomingVendor = extraction?.fields?.vendorName?.value?.trim().toLowerCase();
    const incomingGstin = extraction?.fields?.vendorGstin?.value?.trim().toUpperCase();
    const incomingInvNumber = extraction?.fields?.invoiceNumber?.value?.trim().toLowerCase();
    const incomingDate = extraction?.fields?.invoiceDate?.value;
    const incomingAmount = extraction?.fields?.totalAmountPaise?.value;

    let checkedCount = 0;

    for (const record of existingRecords) {
      // Don't compare against self
      if (record.id === evidenceId) continue;

      // Organization boundary check
      if (!isCrossOrgAllowed && record.organizationId !== organizationId) {
        continue;
      }

      checkedCount++;

      // Rule 1: Exact File Hash Match (Exact duplicate file)
      if (record.sha256 === sha256) {
        candidates.push({
          collidingEvidenceId: record.id,
          matchType: 'EXACT_HASH',
          matchingFields: { sha256 },
          rule: 'Exact binary SHA-256 collision: The uploaded file bytes are identical to an existing stored invoice.',
          detectedAt: now,
        });
        continue;
      }

      // If key fields are missing from incoming extraction, cannot evaluate invoice fields
      if (!incomingInvNumber || incomingAmount === undefined) {
        continue;
      }

      const existingInvNumber = record.invoiceNumber?.trim().toLowerCase();
      const existingAmount = record.totalAmountPaise;
      const existingGstin = record.vendorGstin?.trim().toUpperCase();
      const existingVendor = record.vendorName?.trim().toLowerCase();
      const existingDate = record.invoiceDate;

      // Rule 2: Multi-Field Exact Match (Same Invoice #, Amount, Date, and GSTIN/Vendor)
      const sameInvoiceNumber = existingInvNumber && existingInvNumber === incomingInvNumber;
      const sameAmount = existingAmount !== undefined && existingAmount === incomingAmount;
      const sameGstin = incomingGstin && existingGstin && incomingGstin === existingGstin;
      const sameVendor = incomingVendor && existingVendor && incomingVendor === existingVendor;
      const sameDate = incomingDate && existingDate && incomingDate === existingDate;

      if (sameInvoiceNumber && sameAmount && (sameGstin || sameVendor) && sameDate) {
        candidates.push({
          collidingEvidenceId: record.id,
          matchType: 'INVOICE_FIELDS_MATCH',
          matchingFields: {
            invoiceNumber: record.invoiceNumber,
            totalAmountPaise: record.totalAmountPaise,
            vendor: record.vendorGstin || record.vendorName,
            date: record.invoiceDate,
          },
          rule: 'Identical invoice fields: Matching invoice number, total amount, vendor identifier, and date across different file uploads.',
          detectedAt: now,
        });
        continue;
      }

      // Rule 3: Fuzzy Vendor Match (Same Invoice # and Amount, but slight difference in vendor name)
      if (sameInvoiceNumber && sameAmount && incomingVendor && existingVendor) {
        const normIncoming = this.normalizeVendor(incomingVendor);
        const normExisting = this.normalizeVendor(existingVendor);
        const similarity = this.calculateStringSimilarity(normIncoming, normExisting);
        if (similarity >= 0.75) {
          candidates.push({
            collidingEvidenceId: record.id,
            matchType: 'FUZZY_VENDOR_MATCH',
            matchingFields: {
              invoiceNumber: record.invoiceNumber,
              totalAmountPaise: record.totalAmountPaise,
              incomingVendor: incomingVendor,
              existingVendor: existingVendor,
              similarityScore: parseFloat(similarity.toFixed(2)),
            },
            rule: `Near-duplicate detected: Matching invoice number and amount with high vendor name similarity (${Math.round(similarity * 100)}%).`,
            detectedAt: now,
          });
        }
      }
    }

    let status: DuplicateStatus = 'NO_MATCH_FOUND';
    if (candidates.some((c) => c.matchType === 'EXACT_HASH' || c.matchType === 'INVOICE_FIELDS_MATCH')) {
      status = 'CONFIRMED_DUPLICATE';
    } else if (candidates.length > 0) {
      status = 'POSSIBLE_DUPLICATE';
    }

    const notes =
      candidates.length > 0
        ? `Detected ${candidates.length} duplicate candidate(s). Matches require reviewer verification.`
        : 'No duplicate candidates detected within organization records.';

    return {
      status,
      candidates,
      checkedCount,
      notes,
    };
  }

  /**
   * Bigram Dice coefficient string similarity (0.0 to 1.0)
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (s1 === s2) return 1.0;
    if (s1.length < 2 || s2.length < 2) return 0.0;

    const getBigrams = (str: string): Map<string, number> => {
      const bigrams = new Map<string, number>();
      for (let i = 0; i < str.length - 1; i++) {
        const bigram = str.substring(i, i + 2);
        bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
      }
      return bigrams;
    };

    const b1 = getBigrams(s1);
    const b2 = getBigrams(s2);

    let intersection = 0;
    for (const [bigram, count] of b1.entries()) {
      if (b2.has(bigram)) {
        intersection += Math.min(count, b2.get(bigram)!);
      }
    }

    const totalBigrams = s1.length - 1 + (s2.length - 1);
    return (2 * intersection) / totalBigrams;
  }

  private normalizeVendor(vendor: string): string {
    return vendor
      .toLowerCase()
      .replace(/\bprivate limited\b/g, 'pvt ltd')
      .replace(/\bcorporation\b/g, 'corp')
      .replace(/\blimited\b/g, 'ltd')
      .replace(/\benterprises\b/g, 'ent')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }
}
