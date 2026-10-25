import { Router, Request, Response } from 'express';
import { LiveRelayerPipeline } from '../services/liveRelayerPipeline.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();
const relayer = LiveRelayerPipeline.getInstance();

/**
 * GET /api/anchors/health
 * Readiness healthcheck distinguishing Database, Redis, Sepolia RPC, and Relayer status
 */
router.get('/health', (req: Request, res: Response) => {
  const health = relayer.getHealth();
  res.json({
    success: true,
    ...health,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/anchors
 * Authenticated endpoint: Accepts donation / evidence commitment and enqueues it for Merkle batching
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { evidenceDigest, idempotencyKey, organizationId } = req.body;

    if (!evidenceDigest || !idempotencyKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: evidenceDigest (32-byte hex) and idempotencyKey',
      });
    }

    const commitment = await relayer.enqueueCommitment({
      ownerId: user.sub || user.id || 'anonymous_donor',
      organizationId: organizationId || user.organizationId,
      evidenceDigest,
      idempotencyKey,
    });

    res.status(202).json({
      success: true,
      message: 'Commitment enqueued for live Ethereum Sepolia Merkle batch anchoring.',
      commitment,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to enqueue commitment',
    });
  }
});

/**
 * GET /api/anchors/:id
 * Returns current durable status of a commitment (QUEUED, BATCHING, PENDING, CONFIRMED, FAILED, UNKNOWN)
 */
router.get('/:id', (req: Request, res: Response) => {
  const record = relayer.getCommitment(req.params.id);
  if (!record) {
    return res.status(404).json({
      success: false,
      error: `Commitment not found: ${req.params.id}`,
    });
  }

  res.json({
    success: true,
    commitment: record,
  });
});

/**
 * GET /api/anchors/:id/proof
 * Returns cryptographic Merkle inclusion proof and confirmed batch metadata
 */
router.get('/:id/proof', (req: Request, res: Response) => {
  const result = relayer.getCommitmentByProof(req.params.id);
  if (!result) {
    return res.status(404).json({
      success: false,
      error: `Inclusion proof not yet available for commitment ${req.params.id} (status might still be QUEUED or BATCHING).`,
    });
  }

  res.json({
    success: true,
    ...result,
  });
});

export const anchorRoutes = router;
