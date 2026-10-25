import exifr from 'exifr';
import type { OcrExtractionResult } from '../ocr/ocrEngine.js';

async function safePdfParse(buffer: Buffer): Promise<{ text: string; numpages: number; info?: any }> {
  try {
    const mod: any = await import('pdf-parse');
    const parseFn = typeof mod === 'function' ? mod : mod.default || mod;
    return await parseFn(buffer);
  } catch (err: any) {
    throw err;
  }
}

export type ForensicSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ForensicRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'INCONCLUSIVE';

export interface ForensicSignal {
  code: string;
  severity: ForensicSeverity;
  title: string;
  rationale: string;
  evidence: Record<string, any>;
}

export interface DocumentMetadata {
  createDate?: string;
  modifyDate?: string;
  software?: string;
  make?: string;
  model?: string;
  imageWidth?: number;
  imageHeight?: number;
  colorSpace?: string;
  pdfProducer?: string;
  pdfCreator?: string;
  pdfCreationDate?: string;
  pdfModDate?: string;
  isMetadataStripped?: boolean;
}

export interface ForensicAnalysisResult {
  metadata: DocumentMetadata;
  checksPerformed: string[];
  signals: ForensicSignal[];
  overallRisk: ForensicRiskLevel;
  methodologyNotes: string;
  processedAt: string;
}

export class ForensicsService {
  private static instance: ForensicsService;

  public static getInstance(): ForensicsService {
    if (!ForensicsService.instance) {
      ForensicsService.instance = new ForensicsService();
    }
    return ForensicsService.instance;
  }

  /**
   * Performs explainable non-destructive forensic analysis
   */
  public async analyzeDocument(params: {
    buffer: Buffer;
    mimeType: string;
    filename: string;
    ocrResult?: OcrExtractionResult;
  }): Promise<ForensicAnalysisResult> {
    const { buffer, mimeType, filename, ocrResult } = params;
    const checksPerformed: string[] = [];
    const signals: ForensicSignal[] = [];

    // 1. Extract Metadata
    checksPerformed.push('METADATA_EXTRACTION');
    const metadata = await this.extractMetadata(buffer, mimeType, filename);

    // 2. Check for Suspicious Editing Software Signatures
    checksPerformed.push('SOFTWARE_SIGNATURE_CHECK');
    const software = (metadata.software || metadata.pdfProducer || metadata.pdfCreator || '').toLowerCase();
    const editingKeywords = ['photoshop', 'gimp', 'canva', 'pixelmator', 'paint.net', 'coreldraw', 'illustrator'];
    const detectedEditor = editingKeywords.find((kw) => software.includes(kw));

    if (detectedEditor) {
      signals.push({
        code: 'SUSPICIOUS_SOFTWARE_SIGNATURE',
        severity: 'MEDIUM',
        title: `Editing software identifier detected (${detectedEditor})`,
        rationale:
          'Document metadata references desktop/online graphic editing software rather than a direct scanner or billing software. While frequently used to compress or rotate receipts, this represents a potential tampering risk signal.',
        evidence: {
          detectedKeyword: detectedEditor,
          softwareTag: metadata.software,
          pdfProducer: metadata.pdfProducer,
          pdfCreator: metadata.pdfCreator,
        },
      });
    }

    // 3. Check Date Discrepancy between OCR Invoice Date and Metadata Timestamp
    checksPerformed.push('DATE_METADATA_DISCREPANCY_CHECK');
    if (ocrResult?.fields?.invoiceDate?.value) {
      const invoiceDateStr = ocrResult.fields.invoiceDate.value;
      const metaDateStr = metadata.createDate || metadata.pdfCreationDate || metadata.modifyDate;

      if (metaDateStr) {
        const invDate = new Date(invoiceDateStr);
        const metaDate = new Date(metaDateStr);

        if (!isNaN(invDate.getTime()) && !isNaN(metaDate.getTime())) {
          const diffDays = Math.abs(Math.floor((metaDate.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24)));
          if (diffDays > 365) {
            signals.push({
              code: 'DATE_METADATA_DISCREPANCY',
              severity: 'MEDIUM',
              title: `Invoice date differs significantly from metadata timestamp (${diffDays} days)`,
              rationale:
                'The stated invoice date on the document differs by more than 365 days from the file creation/modification timestamp embedded in the metadata.',
              evidence: {
                statedInvoiceDate: invoiceDateStr,
                metadataTimestamp: metaDateStr,
                differenceDays: diffDays,
              },
            });
          }
        }
      }
    }

    // 4. Check Arithmetic Consistency (Subtotal + Taxes vs Total)
    checksPerformed.push('ARITHMETIC_INTEGRITY_CHECK');
    if (ocrResult && !ocrResult.arithmeticCheck.passed) {
      signals.push({
        code: 'ARITHMETIC_INCONSISTENCY',
        severity: 'HIGH',
        title: 'Invoice math does not reconcile (discrepancy > ₹1.00)',
        rationale: ocrResult.arithmeticCheck.notes,
        evidence: {
          computedTotalPaise: ocrResult.arithmeticCheck.computedTotalPaise,
          statedTotalPaise: ocrResult.arithmeticCheck.statedTotalPaise,
          discrepancyPaise: ocrResult.arithmeticCheck.discrepancyPaise,
        },
      });
    }

    // 5. Resolution & Dimension Checks
    checksPerformed.push('RESOLUTION_DIMENSION_CHECK');
    if (metadata.imageWidth && metadata.imageHeight) {
      if (metadata.imageWidth < 300 || metadata.imageHeight < 300) {
        signals.push({
          code: 'LOW_RESOLUTION_SCAN',
          severity: 'LOW',
          title: `Low resolution image (${metadata.imageWidth}x${metadata.imageHeight} px)`,
          rationale: 'Image dimensions are below recommended DPI for forensic and optical character validation.',
          evidence: {
            width: metadata.imageWidth,
            height: metadata.imageHeight,
          },
        });
      }
    }

    // 6. Compute Overall Risk Level
    const overallRisk = this.calculateRisk(signals);

    return {
      metadata,
      checksPerformed,
      signals,
      overallRisk,
      methodologyNotes:
        'Forensic analysis evaluates explainable digital indicators (software signatures, metadata consistency, and tax arithmetic). Automated findings are decision-support signals and do not constitute an authoritative legal verdict of fraud without human review.',
      processedAt: new Date().toISOString(),
    };
  }

  private async extractMetadata(buffer: Buffer, mimeType: string, filename: string): Promise<DocumentMetadata> {
    const isPdf = mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      try {
        const parsed = await safePdfParse(buffer);
        const info = parsed.info || {};
        return {
          pdfProducer: info.Producer || undefined,
          pdfCreator: info.Creator || undefined,
          pdfCreationDate: info.CreationDate ? String(info.CreationDate) : undefined,
          pdfModDate: info.ModDate ? String(info.ModDate) : undefined,
        };
      } catch {
        return { isMetadataStripped: true };
      }
    }

    // Image EXIF
    try {
      const data = await exifr.parse(buffer, {
        pick: ['Make', 'Model', 'Software', 'CreateDate', 'ModifyDate', 'ImageWidth', 'ImageHeight', 'ColorSpace'],
      });

      if (!data || Object.keys(data).length === 0) {
        return { isMetadataStripped: true };
      }

      return {
        make: data.Make,
        model: data.Model,
        software: data.Software,
        createDate: data.CreateDate ? new Date(data.CreateDate).toISOString() : undefined,
        modifyDate: data.ModifyDate ? new Date(data.ModifyDate).toISOString() : undefined,
        imageWidth: data.ImageWidth,
        imageHeight: data.ImageHeight,
        colorSpace: data.ColorSpace !== undefined ? String(data.ColorSpace) : undefined,
        isMetadataStripped: false,
      };
    } catch {
      return { isMetadataStripped: true };
    }
  }

  private calculateRisk(signals: ForensicSignal[]): ForensicRiskLevel {
    const hasCritical = signals.some((s) => s.severity === 'CRITICAL');
    const hasHigh = signals.some((s) => s.severity === 'HIGH');
    const hasMedium = signals.some((s) => s.severity === 'MEDIUM');

    if (hasCritical || hasHigh) return 'HIGH';
    if (hasMedium) return 'MEDIUM';
    return 'LOW';
  }
}
