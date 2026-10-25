/**
 * TrustFabric OCR Extraction Engine Interface & Models
 * Provides replaceable document extraction abstraction for Tesseract.js or AWS Textract.
 */

export type FieldStatus = 'EXTRACTED' | 'LOW_CONFIDENCE' | 'MISSING' | 'NEEDS_REVIEW' | 'USER_CONFIRMED';

export interface ExtractedField<T> {
  value: T;
  rawText?: string;
  confidence?: number; // 0.0 to 1.0 (heuristic or engine-reported)
  status: FieldStatus;
  page?: number;
}

export interface LineItem {
  description: string;
  amountPaise: number;
}

export interface OcrExtractionResult {
  rawText: string;
  pageCount: number;
  engineVersion: string;
  overallConfidence: number; // 0.0 to 1.0
  fields: {
    vendorName?: ExtractedField<string>;
    vendorGstin?: ExtractedField<string>;
    invoiceNumber?: ExtractedField<string>;
    invoiceDate?: ExtractedField<string>; // YYYY-MM-DD
    currency: ExtractedField<string>;
    subtotalPaise?: ExtractedField<number>;
    taxableAmountPaise?: ExtractedField<number>;
    cgstPaise?: ExtractedField<number>;
    sgstPaise?: ExtractedField<number>;
    igstPaise?: ExtractedField<number>;
    totalAmountPaise?: ExtractedField<number>;
    poNumber?: ExtractedField<string>;
    lineItems: LineItem[];
  };
  arithmeticCheck: {
    passed: boolean;
    computedTotalPaise: number;
    statedTotalPaise?: number;
    discrepancyPaise: number;
    notes: string;
  };
  gstinValidation?: {
    formatValid: boolean;
    stateCode?: string;
    stateName?: string;
    checksumValid: boolean;
    notice: string;
  };
}

export interface IOcrEngine {
  readonly engineName: string;
  readonly engineVersion: string;
  extract(buffer: Buffer, mimeType: string, filename: string): Promise<OcrExtractionResult>;
}
