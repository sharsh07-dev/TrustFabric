import { Router, Request, Response } from 'express';
import multer from 'multer';
import { EvidenceVaultService } from '../services/evidenceVaultService.js';
import { requireAuth, requireRoles } from '../middleware/authMiddleware.js';

const router = Router();
const vaultService = EvidenceVaultService.getInstance();

// Multer memory storage for direct streaming to Supabase Storage / Vault
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

/**
 * GET /api/evidence/vault/status
 * Returns private storage vault status (Supabase bucket ngo-evidence, encryption mode, 300s TTL)
 */
router.get('/vault/status', (req: Request, res: Response) => {
  const status = vaultService.getStatus();
  res.json({
    success: true,
    ...status,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/evidence/upload
 * Authenticated upload for invoices and compliance PDFs.
 * Computes SHA-256 server-side.
 * Rejects DONOR role with 403 Forbidden.
 * Rejects invalid MIME types and oversized files.
 */
router.post(
  '/upload',
  requireAuth,
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Missing user session' });
      }

      // Check role permissions: Donors are strictly forbidden from uploading vendor receipts
      if (user.role === 'DONOR') {
        return res.status(403).json({
          success: false,
          code: 'ROLE_FORBIDDEN',
          error: 'Forbidden: Donors are not authorized to upload compliance or vendor receipts.',
        });
      }

      let fileBuffer: Buffer | null = null;
      let originalFilename = '';
      let mimeType = '';
      let organizationId = req.body.organizationId || user.organizationId || 'org-general';
      let claimId = req.body.claimId;
      let clientSuppliedSha256 = req.body.clientSuppliedSha256;

      if (req.file) {
        // Multipart upload
        fileBuffer = req.file.buffer;
        originalFilename = req.file.originalname;
        mimeType = req.file.mimetype;
      } else if (req.body.fileBase64 && req.body.originalFilename) {
        // JSON base64 upload (mobile / web API)
        fileBuffer = Buffer.from(req.body.fileBase64, 'base64');
        originalFilename = req.body.originalFilename;
        mimeType = req.body.mimeType || 'application/pdf';
      } else {
        return res.status(400).json({
          success: false,
          error: 'No file received. Provide multipart file or fileBase64 in JSON.',
        });
      }

      const result = await vaultService.uploadEvidence({
        buffer: fileBuffer,
        originalFilename,
        mimeType,
        organizationId,
        user,
        claimId,
        clientSuppliedSha256,
      });

      res.status(201).json({
        success: true,
        message: 'Evidence uploaded and fingerprinted successfully with server-computed SHA-256.',
        evidence: result.evidence,
        hashMismatchDetected: result.hashMismatchDetected,
      });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        code: err.code || 'UPLOAD_FAILED',
        error: err.message || 'Evidence upload failed',
      });
    }
  }
);

/**
 * GET /api/evidence
 * Lists evidence records within user's authorization boundary.
 * DONOR receives 403 Forbidden.
 */
router.get('/', requireAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  if (user.role === 'DONOR') {
    return res.status(403).json({
      success: false,
      code: 'ROLE_FORBIDDEN',
      error: 'Forbidden: Donors cannot view raw compliance or receipt registries.',
    });
  }

  const list = vaultService.listEvidence(user);
  res.json({
    success: true,
    count: list.length,
    evidence: list,
  });
});

/**
 * GET /api/evidence/:id
 * Retrieves metadata for an evidence document.
 */
router.get('/:id', requireAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  if (user.role === 'DONOR') {
    return res.status(403).json({
      success: false,
      code: 'ROLE_FORBIDDEN',
      error: 'Forbidden: Donors cannot view raw evidence metadata.',
    });
  }

  const evidence = vaultService.getEvidence(req.params.id);
  if (!evidence) {
    return res.status(404).json({ success: false, error: `Evidence document not found: ${req.params.id}` });
  }

  // Cross-org check for NGO personnel
  const isGlobal = user.role === 'ADMIN' || user.role === 'AUDITOR';
  if (!isGlobal && user.organizationId && user.organizationId !== evidence.organizationId) {
    return res.status(403).json({
      success: false,
      code: 'CROSS_ORG_ACCESS_DENIED',
      error: `Forbidden: User does not belong to organization ${evidence.organizationId}.`,
    });
  }

  res.json({
    success: true,
    evidence,
  });
});

/**
 * GET /api/evidence/:id/signed-url
 * Generates a 5-minute (300-second) presigned download URL.
 * Strictly enforces that DONOR cannot access raw documents.
 * Enforces cross-organization access boundary.
 */
router.get('/:id/signed-url', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const ttlSeconds = parseInt((req.query.ttl as string) || '300', 10);

    const hostBaseUrl = `${req.protocol}://${req.get('host')}`;
    const result = await vaultService.generateSignedUrl(req.params.id, user, ttlSeconds, hostBaseUrl);
    res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      code: err.code || 'SIGNED_URL_FAILED',
      error: err.message,
    });
  }
});

/**
 * POST /api/evidence/:id/verify-hash
 * Re-reads stored document bytes and verifies hash integrity (tamper detection).
 */
router.post('/:id/verify-hash', requireAuth, requireRoles('ADMIN', 'AUDITOR'), async (req: Request, res: Response) => {
  try {
    const result = await vaultService.verifyFileIntegrity(req.params.id);
    res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/evidence/:id/raw
 * Serves the raw file bytes when requested with a valid, unexpired signed token.
 */
router.get('/:id/raw', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const token = (req.query.token as string) || '';
    const exp = (req.query.exp as string) || '';

    if (!token || !exp) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Missing signed URL token or expiry' });
    }

    const isValid = vaultService.verifySignedToken(id, token, exp);
    if (!isValid) {
      return res.status(403).json({
        success: false,
        code: 'SIGNED_URL_EXPIRED_OR_INVALID',
        error: 'Forbidden: Signed download link has expired or signature is invalid.',
      });
    }

    const evidence = vaultService.getEvidence(id);
    if (!evidence) {
      return res.status(404).json({ success: false, error: 'Evidence record not found' });
    }

    const buffer = await vaultService.getRawBuffer(evidence.storageKey);

    res.setHeader('Content-Type', evidence.mimeType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `inline; filename="${evidence.originalFilename}"`);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/evidence/:id/extraction
 * Retrieves extracted OCR fields, confidence, line items, and audit corrections.
 */
router.get('/:id/extraction', requireAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  if (user.role === 'DONOR') {
    return res.status(403).json({ success: false, error: 'Forbidden: Donors cannot view extraction data.' });
  }

  const evidence = vaultService.getEvidence(req.params.id);
  if (!evidence) {
    return res.status(404).json({ success: false, error: 'Evidence record not found' });
  }

  const isGlobal = user.role === 'ADMIN' || user.role === 'AUDITOR';
  if (!isGlobal && user.organizationId && user.organizationId !== evidence.organizationId) {
    return res.status(403).json({ success: false, error: 'Forbidden: Cross-organization access denied.' });
  }

  const extraction = vaultService.getExtraction(req.params.id);
  const corrections = vaultService.getUserCorrections(req.params.id);

  res.json({
    success: true,
    evidenceId: req.params.id,
    ocrStatus: evidence.ocrStatus,
    extraction: extraction || null,
    userCorrections: corrections,
  });
});

/**
 * GET /api/evidence/:id/forensics
 * Retrieves EXIF metadata, arithmetic checks, detected signals, and overall forensic risk level.
 */
router.get('/:id/forensics', requireAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  if (user.role === 'DONOR') {
    return res.status(403).json({ success: false, error: 'Forbidden: Donors cannot view forensic reports.' });
  }

  const evidence = vaultService.getEvidence(req.params.id);
  if (!evidence) {
    return res.status(404).json({ success: false, error: 'Evidence record not found' });
  }

  const isGlobal = user.role === 'ADMIN' || user.role === 'AUDITOR';
  if (!isGlobal && user.organizationId && user.organizationId !== evidence.organizationId) {
    return res.status(403).json({ success: false, error: 'Forbidden: Cross-organization access denied.' });
  }

  const forensics = vaultService.getForensics(req.params.id);

  res.json({
    success: true,
    evidenceId: req.params.id,
    forensicRiskLevel: evidence.forensicRiskLevel,
    forensics: forensics || null,
  });
});

/**
 * GET /api/evidence/:id/duplicates
 * Retrieves duplicate candidates, match types, matching fields, and candidate evidence IDs.
 */
router.get('/:id/duplicates', requireAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  if (user.role === 'DONOR') {
    return res.status(403).json({ success: false, error: 'Forbidden: Donors cannot inspect duplicate matches.' });
  }

  const evidence = vaultService.getEvidence(req.params.id);
  if (!evidence) {
    return res.status(404).json({ success: false, error: 'Evidence record not found' });
  }

  const isGlobal = user.role === 'ADMIN' || user.role === 'AUDITOR';
  if (!isGlobal && user.organizationId && user.organizationId !== evidence.organizationId) {
    return res.status(403).json({ success: false, error: 'Forbidden: Cross-organization access denied.' });
  }

  const candidates = vaultService.getDuplicates(req.params.id);

  res.json({
    success: true,
    evidenceId: req.params.id,
    duplicateStatus: evidence.duplicateStatus,
    candidateCount: candidates.length,
    candidates,
  });
});

/**
 * POST /api/evidence/:id/review
 * Records an authorized human reviewer decision (GENUINE, SUSPICIOUS, INCONCLUSIVE).
 * Requires ADMIN or AUDITOR role.
 */
router.post(
  '/:id/review',
  requireAuth,
  requireRoles('ADMIN', 'AUDITOR'),
  (req: Request, res: Response) => {
    try {
      const { decision, notes } = req.body;
      if (!decision || !['GENUINE', 'SUSPICIOUS', 'INCONCLUSIVE'].includes(decision)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid review decision. Permitted values: GENUINE, SUSPICIOUS, INCONCLUSIVE',
        });
      }

      const user = (req as any).user;
      const updated = vaultService.recordReviewDecision(req.params.id, decision, user, notes);

      res.json({
        success: true,
        message: 'Review decision recorded successfully.',
        evidence: updated,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * PATCH /api/evidence/:id/extraction
 * Allows authorized users to correct extracted fields while preserving the original extraction audit trail.
 */
router.patch('/:id/extraction', requireAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user.role === 'DONOR') {
      return res.status(403).json({ success: false, error: 'Forbidden: Donors cannot modify extraction data.' });
    }

    const { corrections } = req.body;
    if (!corrections || typeof corrections !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing corrections object.' });
    }

    const result = vaultService.applyCorrection(req.params.id, corrections, user);

    res.json({
      success: true,
      message: 'Corrections applied and tracked in user correction audit log.',
      extraction: result.extraction,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export const evidenceRoutes = router;
