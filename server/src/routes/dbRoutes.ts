import { Router } from 'express';
import { DbPersistenceService } from '../services/dbPersistenceService.js';
import { requireAuth, requireRoles } from '../middleware/authMiddleware.js';

const router = Router();
const dbService = DbPersistenceService.getInstance();

/**
 * GET /api/db/status
 * Returns cloud database connection status (Supabase PostgreSQL / aws-0-ap-northeast-1)
 * Displays pooler details, masked connection URL, and persisted record counts.
 */
router.get('/status', async (req, res) => {
  const status = dbService.getStatus();
  res.json({
    success: true,
    ...status,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/db/users
 * Returns list of persisted users with roles (Donor, Admin, Auditor, Field Worker, Vendor)
 */
router.get('/users', async (req, res) => {
  try {
    const users = await dbService.getAllUsers();
    res.json({
      success: true,
      count: users.length,
      users,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/db/grants
 * Returns persisted grants and purpose allocations
 */
router.get('/grants', async (req, res) => {
  try {
    const grants = await dbService.getAllGrants();
    res.json({
      success: true,
      count: grants.length,
      grants,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/db/claims
 * Returns persisted expense claims and invoices
 */
router.get('/claims', async (req, res) => {
  try {
    const claims = await dbService.getAllExpenseClaims();
    res.json({
      success: true,
      count: claims.length,
      claims,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/db/claims
 * Submits an expense claim, checking duplicate nullifier registry
 */
router.post('/claims', requireAuth, requireRoles('ADMIN', 'AUDITOR', 'FIELD_WORKER', 'VENDOR'), async (req, res) => {
  try {
    const {
      claimCode,
      grantId,
      submitterId,
      amountPaise,
      currency = 'INR',
      vendorName,
      invoiceNumber,
      invoiceDate,
      invoiceSha256,
      nullifierHash,
    } = req.body;

    if (!claimCode || !grantId || !submitterId || !amountPaise || !invoiceNumber || !nullifierHash) {
      return res.status(400).json({
        success: false,
        error: 'Missing required claim fields (claimCode, grantId, submitterId, amountPaise, invoiceNumber, nullifierHash)',
      });
    }

    const result = await dbService.submitExpenseClaim({
      claimCode,
      grantId,
      submitterId,
      amountPaise,
      currency,
      vendorName: vendorName || 'Unspecified Vendor',
      invoiceNumber,
      invoiceDate: invoiceDate || new Date().toISOString(),
      invoiceSha256: invoiceSha256 || '0'.repeat(64),
      nullifierHash,
      status: 'PENDING',
    });

    if (result.isDuplicate) {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_NULLIFIER_COLLISION',
        error: `Expense claim flagged: duplicate invoice nullifier detected with prior claim ${result.duplicateCollidingId}`,
        claim: result.claim,
      });
    }

    res.status(201).json({
      success: true,
      claim: result.claim,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/db/nullifiers
 * Returns the privacy-preserving duplicate nullifier registry
 */
router.get('/nullifiers', async (req, res) => {
  try {
    const nullifiers = await dbService.getNullifierRegistry();
    res.json({
      success: true,
      count: nullifiers.length,
      nullifiers,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/db/audit-chain
 * Returns the sequential SHA-256 cryptographic audit block chain
 */
router.get('/audit-chain', async (req, res) => {
  try {
    const blocks = await dbService.getAuditBlocks();
    res.json({
      success: true,
      blockCount: blocks.length,
      blocks,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export const dbRoutes = router;
