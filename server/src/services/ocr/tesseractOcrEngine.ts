import { IOcrEngine, OcrExtractionResult, ExtractedField, LineItem, FieldStatus } from './ocrEngine.js';
import { GstinValidator } from './gstinValidator.js';

async function safePdfParse(buffer: Buffer): Promise<{ text: string; numpages: number; info?: any }> {
  try {
    const mod: any = await import('pdf-parse');
    const parseFn = typeof mod === 'function' ? mod : mod.default || mod;
    return await parseFn(buffer);
  } catch (err: any) {
    throw err;
  }
}

export class TesseractOcrEngine implements IOcrEngine {
  public readonly engineName = 'Tesseract.js & Safe PDF Parser';
  public readonly engineVersion = 'tesseract-7.0.0-pdf-1.1';

  public async extract(buffer: Buffer, mimeType: string, filename: string): Promise<OcrExtractionResult> {
    let rawText = '';
    let pageCount = 1;
    let confidence: number = 0.90; // baseline heuristic

    const isPdf = mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      try {
        const parsed = await safePdfParse(buffer);
        rawText = parsed.text || '';
        pageCount = parsed.numpages || 1;
        confidence = rawText.length > 50 ? 0.96 : 0.60;
      } catch (err: any) {
        // Fall back to OCR or pattern matching
      }
    }

    // If text was not extractable from PDF or file is an image, run Tesseract OCR
    if (!rawText || rawText.trim().length < 15) {
      try {
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng');
        const ret = await worker.recognize(buffer);
        rawText = ret.data.text || '';
        confidence = ret.data.confidence ? ret.data.confidence / 100 : 0.85;
        await worker.terminate();
      } catch (tessErr: any) {
        console.warn(`[OCR Engine] Tesseract worker execution note: ${tessErr.message}`);
        // If image has no readable text, keep rawText empty so fields are reported as MISSING
      }
    }

    return this.parseExtractedText(rawText, pageCount, confidence);
  }

  /**
   * Robust parser extracting structured invoice fields from OCR/PDF text
   */
  public parseExtractedText(rawText: string, pageCount: number, baseConfidence: number): OcrExtractionResult {
    const lines = rawText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // 1. Vendor GSTIN Extraction
    const gstinRegex = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})\b/g;
    const gstinMatches = Array.from(rawText.matchAll(gstinRegex));
    let vendorGstinField: ExtractedField<string> | undefined;
    let gstinValidationResult;

    if (gstinMatches.length > 0) {
      const gstinVal = gstinMatches[0][1].toUpperCase();
      gstinValidationResult = GstinValidator.validate(gstinVal);
      vendorGstinField = {
        value: gstinVal,
        rawText: gstinMatches[0][0],
        confidence: baseConfidence,
        status: gstinValidationResult.formatValid ? 'EXTRACTED' : 'NEEDS_REVIEW',
      };
    } else {
      gstinValidationResult = {
        formatValid: false,
        checksumValid: false,
        notice: 'No 15-character GSTIN pattern was detected in the document text.',
      };
    }

    // 2. Vendor Name Extraction
    let vendorNameField: ExtractedField<string> | undefined;
    const nonVendorHeaderWords = ['TAX INVOICE', 'INVOICE', 'BILL OF SUPPLY', 'CASH MEMO', 'RECEIPT', 'ORIGINAL FOR RECIPIENT', 'DUPLICATE FOR TRANSPORTER'];
    for (const line of lines.slice(0, 10)) {
      const upper = line.toUpperCase();
      const isHeaderWord = nonVendorHeaderWords.some((w) => upper.includes(w));
      const hasSpecialOnly = !/[a-zA-Z]{3,}/.test(line);

      if (!isHeaderWord && !hasSpecialOnly && line.length > 3 && line.length < 80) {
        vendorNameField = {
          value: line.replace(/[^\w\s.,&'-]/g, '').trim(),
          confidence: baseConfidence * 0.95,
          status: 'EXTRACTED',
        };
        break;
      }
    }

    // 3. Invoice Number Extraction
    let invoiceNumberField: ExtractedField<string> | undefined;
    const invRegex = /(?:invoice|bill|receipt|inv)[\s\w#./-]*?[:#]\s*([A-Z0-9\/-]{2,30})/i;
    const invRegexAlt = /(?:invoice|bill|receipt)[\s]+(?:no|num|number|#)[\s.:#]*([A-Z0-9\/-]{2,30})/i;
    const commonWords = new Set(['number', 'numbers', 'date', 'amount', 'details', 'text', 'line', 'lines', 'total']);
    for (const line of lines) {
      const match = line.match(invRegex) || line.match(invRegexAlt);
      if (match && match[1]) {
        const val = match[1].replace(/^[#:\s]+/, '').trim();
        if (val.length >= 2 && !commonWords.has(val.toLowerCase()) && (/\d/.test(val) || val.includes('-') || val.includes('/'))) {
          invoiceNumberField = {
            value: val,
            rawText: line,
            confidence: baseConfidence * 0.92,
            status: 'EXTRACTED',
          };
          break;
        }
      }
    }

    // 4. Invoice Date Extraction
    let invoiceDateField: ExtractedField<string> | undefined;
    const dateRegexes = [
      /(?:date|dated|dt)[\s.:]*([0-9]{1,2}[-\/.][0-9]{1,2}[-\/.][0-9]{2,4})/i,
      /\b([0-9]{4}[-\/.][0-9]{1,2}[-\/.][0-9]{1,2})\b/,
      /\b([0-9]{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]+[0-9]{4})\b/i,
    ];

    for (const regex of dateRegexes) {
      const match = rawText.match(regex);
      if (match && match[1]) {
        const normalizedDate = this.normalizeDate(match[1]);
        if (normalizedDate) {
          invoiceDateField = {
            value: normalizedDate,
            rawText: match[1],
            confidence: baseConfidence * 0.94,
            status: 'EXTRACTED',
          };
          break;
        }
      }
    }

    // 5. Amount Extraction (Total, Subtotal, CGST, SGST, IGST)
    const subtotalRegex = /(?:sub\s*total|taxable\s+amount|taxable\s+value)[\s:₹Rs.]*([0-9,]+\.[0-9]{2}|[0-9,]+)/i;
    const cgstRegex = /cgst(?:\s*@\s*[\d.]+\s*%)?[\s:]+[₹Rs.\s]*([0-9,]+\.[0-9]{2}|[0-9,]+)/i;
    const sgstRegex = /sgst(?:\s*@\s*[\d.]+\s*%)?[\s:]+[₹Rs.\s]*([0-9,]+\.[0-9]{2}|[0-9,]+)/i;
    const igstRegex = /igst(?:\s*@\s*[\d.]+\s*%)?[\s:]+[₹Rs.\s]*([0-9,]+\.[0-9]{2}|[0-9,]+)/i;

    let totalAmountPaise: number | undefined;
    let subtotalPaise: number | undefined;
    let cgstPaise: number | undefined;
    let sgstPaise: number | undefined;
    let igstPaise: number | undefined;

    for (const line of lines) {
      if (/(?:grand\s+total|invoice\s+total|net\s+amount|total\s+payable)/i.test(line)) {
        const m = line.match(/(?:grand\s+total|invoice\s+total|net\s+amount|total\s+payable)[\s:₹Rs.]*([0-9,]+\.[0-9]{2}|[0-9,]+)/i);
        if (m && m[1]) {
          totalAmountPaise = this.parsePaise(m[1]);
          break;
        }
      } else if (!/sub\s*total/i.test(line) && /\btotal\b/i.test(line)) {
        const m = line.match(/\btotal[\s:₹Rs.]*([0-9,]+\.[0-9]{2}|[0-9,]+)/i);
        if (m && m[1]) {
          totalAmountPaise = this.parsePaise(m[1]);
        }
      }
    }

    const subtotalMatch = rawText.match(subtotalRegex);
    if (subtotalMatch && subtotalMatch[1]) {
      subtotalPaise = this.parsePaise(subtotalMatch[1]);
    }

    const cgstMatch = rawText.match(cgstRegex);
    if (cgstMatch && cgstMatch[1]) {
      cgstPaise = this.parsePaise(cgstMatch[1]);
    }

    const sgstMatch = rawText.match(sgstRegex);
    if (sgstMatch && sgstMatch[1]) {
      sgstPaise = this.parsePaise(sgstMatch[1]);
    }

    const igstMatch = rawText.match(igstRegex);
    if (igstMatch && igstMatch[1]) {
      igstPaise = this.parsePaise(igstMatch[1]);
    }

    // 6. Arithmetic Validation (Subtotal + Taxes vs Total)
    const taxesSum = (cgstPaise || 0) + (sgstPaise || 0) + (igstPaise || 0);
    const computedTotal = (subtotalPaise || 0) + taxesSum;
    let arithmeticPassed = true;
    let discrepancyPaise = 0;
    let arithmeticNotes = 'Arithmetic check verified or insufficient breakdown provided.';

    if (totalAmountPaise && subtotalPaise && taxesSum > 0) {
      discrepancyPaise = Math.abs(totalAmountPaise - computedTotal);
      // Tolerance: ₹1.00 (100 paise) for fractional rounding
      if (discrepancyPaise > 100) {
        arithmeticPassed = false;
        arithmeticNotes = `Arithmetic mismatch detected: Subtotal (₹${(subtotalPaise / 100).toFixed(2)}) + Taxes (₹${(taxesSum / 100).toFixed(2)}) = ₹${(computedTotal / 100).toFixed(2)}, which does not match stated Total (₹${(totalAmountPaise / 100).toFixed(2)}). Discrepancy: ₹${(discrepancyPaise / 100).toFixed(2)}.`;
      } else {
        arithmeticNotes = `Subtotal plus taxes matches stated grand total within rounding tolerance (₹${(discrepancyPaise / 100).toFixed(2)} discrepancy).`;
      }
    }

    // Line items extraction
    const lineItems: LineItem[] = [];
    const itemRegex = /(?:item|desc|particulars)[\s\S]*?(?:total|subtotal)/i;
    // Basic item parsing for lines with quantity and price
    for (const line of lines) {
      const match = line.match(/^([A-Za-z0-9\s.,-]{4,40})\s+(\d+)\s+([0-9,]+\.[0-9]{2})/);
      if (match) {
        lineItems.push({
          description: match[1].trim(),
          amountPaise: this.parsePaise(match[3]),
        });
      }
    }

    return {
      rawText,
      pageCount,
      engineVersion: this.engineVersion,
      overallConfidence: baseConfidence,
      fields: {
        vendorName: vendorNameField,
        vendorGstin: vendorGstinField,
        invoiceNumber: invoiceNumberField,
        invoiceDate: invoiceDateField,
        currency: { value: 'INR', status: 'EXTRACTED' },
        subtotalPaise: subtotalPaise !== undefined ? { value: subtotalPaise, status: 'EXTRACTED', confidence: baseConfidence } : undefined,
        taxableAmountPaise: subtotalPaise !== undefined ? { value: subtotalPaise, status: 'EXTRACTED', confidence: baseConfidence } : undefined,
        cgstPaise: cgstPaise !== undefined ? { value: cgstPaise, status: 'EXTRACTED', confidence: baseConfidence } : undefined,
        sgstPaise: sgstPaise !== undefined ? { value: sgstPaise, status: 'EXTRACTED', confidence: baseConfidence } : undefined,
        igstPaise: igstPaise !== undefined ? { value: igstPaise, status: 'EXTRACTED', confidence: baseConfidence } : undefined,
        totalAmountPaise: totalAmountPaise !== undefined
          ? {
              value: totalAmountPaise,
              status: arithmeticPassed ? 'EXTRACTED' : 'NEEDS_REVIEW',
              confidence: arithmeticPassed ? baseConfidence : baseConfidence * 0.7,
            }
          : undefined,
        lineItems,
      },
      arithmeticCheck: {
        passed: arithmeticPassed,
        computedTotalPaise: computedTotal,
        statedTotalPaise: totalAmountPaise,
        discrepancyPaise,
        notes: arithmeticNotes,
      },
      gstinValidation: gstinValidationResult,
    };
  }

  private parsePaise(str: string): number {
    const clean = str.replace(/[^\d.]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : Math.round(num * 100);
  }

  private normalizeDate(dateStr: string): string | null {
    try {
      // 1. DD/MM/YYYY or DD-MM-YYYY
      const parts = dateStr.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/);
      if (parts) {
        let day = parseInt(parts[1], 10);
        let month = parseInt(parts[2], 10);
        let year = parseInt(parts[3], 10);
        if (year < 100) year += 2000;

        // If day > 12 and month <= 12, it's definitely DD/MM/YYYY
        if (month > 12 && day <= 12) {
          // Swapped MM/DD
          const temp = day;
          day = month;
          month = temp;
        }

        const d = new Date(Date.UTC(year, month - 1, day));
        if (!isNaN(d.getTime())) {
          return d.toISOString().split('T')[0];
        }
      }

      // 2. YYYY-MM-DD
      const isoParts = dateStr.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
      if (isoParts) {
        const d = new Date(`${isoParts[1]}-${isoParts[2].padStart(2, '0')}-${isoParts[3].padStart(2, '0')}`);
        if (!isNaN(d.getTime())) {
          return d.toISOString().split('T')[0];
        }
      }

      // 3. Fallback standard parse
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
    } catch {
      return null;
    }
    return null;
  }
}
