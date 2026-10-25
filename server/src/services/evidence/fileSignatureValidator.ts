/**
 * TrustFabric File Signature & Magic Bytes Validator
 * Inspects leading binary bytes to reliably detect format regardless of filename extension.
 * Supports PDF, JPEG, PNG, and WebP.
 */

export interface FileSignatureValidationResult {
  valid: boolean;
  detectedMimeType: string | null;
  extension: string | null;
  error?: string;
}

export class FileSignatureValidator {
  /**
   * Validates file signature against magic bytes
   */
  public static validate(buffer: Buffer): FileSignatureValidationResult {
    if (!buffer || buffer.length < 12) {
      return {
        valid: false,
        detectedMimeType: null,
        extension: null,
        error: 'File is empty or too small to determine binary signature.',
      };
    }

    // 1. PDF: starts with %PDF- (0x25 0x50 0x44 0x46 0x2D)
    if (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d
    ) {
      return {
        valid: true,
        detectedMimeType: 'application/pdf',
        extension: 'pdf',
      };
    }

    // 2. JPEG: starts with FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return {
        valid: true,
        detectedMimeType: 'image/jpeg',
        extension: 'jpg',
      };
    }

    // 3. PNG: starts with 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return {
        valid: true,
        detectedMimeType: 'image/png',
        extension: 'png',
      };
    }

    // 4. WebP: RIFF at 0..3 and WEBP at 8..11
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return {
        valid: true,
        detectedMimeType: 'image/webp',
        extension: 'webp',
      };
    }

    return {
      valid: false,
      detectedMimeType: null,
      extension: null,
      error: 'Unsupported file signature or spoofed file format. Allowed formats: PDF, JPEG, PNG, WebP.',
    };
  }

  /**
   * Checks if client-reported MIME type matches the binary signature
   */
  public static verifyMatch(buffer: Buffer, claimedMimeType: string): boolean {
    const result = this.validate(buffer);
    if (!result.valid || !result.detectedMimeType) return false;

    const normalizedClaim = claimedMimeType.toLowerCase().trim();
    if (normalizedClaim === 'image/jpg' && result.detectedMimeType === 'image/jpeg') return true;

    return result.detectedMimeType === normalizedClaim;
  }
}
