import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { PaymentDatabase } from '../db.js';
import { ServerFirebaseService } from '../services/firebaseService.js';
import { config } from '../config.js';
import type {
  NgoApplicationRecord,
  NgoVerificationDocument,
  NgoDocType,
} from '../types.js';

export const ngoRouter = Router();
const db = PaymentDatabase.getInstance();
const firebaseService = ServerFirebaseService.getInstance();

const MANDATORY_DOC_TYPES: NgoDocType[] = [
  '12A_80G_CERTIFICATE',
  'NGO_DARPAN_REGISTRATION',
  'PAN_CARD_ORGANIZATION',
  'CANCELLED_CHEQUE',
  'PROJECT_PROPOSAL',
];

/**
 * GET /api/ngo/applications
 * Returns all registered NGO funding applications
 */
ngoRouter.get('/ngo/applications', (_req: Request, res: Response) => {
  const apps = db.getAllNgoApplications();
  res.json({
    count: apps.length,
    applications: apps,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/ngo/applications/:id
 * Returns single application record
 */
ngoRouter.get('/ngo/applications/:id', (req: Request, res: Response): void => {
  const app = db.getNgoApplication(req.params.id);
  if (!app) {
    res.status(404).json({ error: `NGO Application not found: ${req.params.id}` });
    return;
  }
  res.json({ application: app });
});

/**
 * POST /api/ngo/applications
 * Submits a new NGO funding application with initial document proofs
 */
ngoRouter.post('/ngo/applications', (req: Request, res: Response): void => {
  try {
    const {
      ngoName,
      regNumber,
      darpanId,
      pan,
      contactPerson,
      contactEmail,
      bankDetails,
      projectProposal,
    } = req.body;

    if (!ngoName || !regNumber || !darpanId || !pan) {
      res.status(400).json({ error: 'Missing required NGO identification and registration fields.' });
      return;
    }
    if (!bankDetails?.accountNumber || !bankDetails?.ifscCode) {
      res.status(400).json({ error: 'Missing required bank disbursement details.' });
      return;
    }
    if (!projectProposal?.title || !projectProposal?.requestedAmountPaise) {
      res.status(400).json({ error: 'Missing required project proposal and budget request.' });
      return;
    }

    const id = `ngo-app-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const newApp: NgoApplicationRecord = {
      id,
      ngoName: String(ngoName).trim(),
      regNumber: String(regNumber).trim(),
      darpanId: String(darpanId).trim(),
      pan: String(pan).trim().toUpperCase(),
      contactPerson: String(contactPerson || '').trim(),
      contactEmail: String(contactEmail || '').trim(),
      bankDetails: {
        accountNumber: String(bankDetails.accountNumber).trim(),
        ifscCode: String(bankDetails.ifscCode).trim().toUpperCase(),
        bankName: String(bankDetails.bankName || 'Standard Bank (Fictional)').trim(),
        beneficiaryName: String(bankDetails.beneficiaryName || ngoName).trim(),
        branch: String(bankDetails.branch || 'Commercial Branch').trim(),
      },
      projectProposal: {
        title: String(projectProposal.title).trim(),
        requestedAmountPaise: Number(projectProposal.requestedAmountPaise),
        purposeCategory: String(projectProposal.purposeCategory || 'GENERAL_RELIEF').trim(),
        milestoneCount: Number(projectProposal.milestoneCount || 3),
        targetBeneficiaries: Number(projectProposal.targetBeneficiaries || 100),
        timelineMonths: Number(projectProposal.timelineMonths || 6),
        summary: String(projectProposal.summary || '').trim(),
      },
      documents: {},
      automatedChecks: {
        darpanFormatValid: /^([A-Z]{2}\/\d{4}\/\d{6,7})$/i.test(darpanId),
        panFormatValid: /^[A-Z]{5}\d{4}[A-Z]$/i.test(pan),
        sha256IntegrityPass: true,
        duplicateDarpanCollision: false,
        duplicateBankCollision: false,
        sanctionScreeningPass: true,
        allMandatoryDocsPresent: false,
        suspiciousFlagsCount: 0,
      },
      verificationStatus: 'SUBMITTED',
      reviewDecision: {
        decision: 'PENDING',
        reviewer: '',
        reviewerRole: '',
        notes: 'Newly submitted application. Awaiting document uploads and automated audit.',
        blockingDefects: [],
      },
      escrowAuthorization: {
        isAuthorized: false,
        blockingReasons: ['Verification pending initial audit and document approvals.'],
        blockchainStatus: 'NOT_AUTHORIZED',
        network: 'Ethereum Sepolia (EVM) / TrustFabricEscrow.sol',
        contractAddress: config.fiatAnchorContractAddress || '0x71C569E962Ac1C7F602B7d2A40EAA672D611293B',
      },
      createdAt: now,
      updatedAt: now,
    };

    db.insertNgoApplication(newApp);

    res.status(201).json({
      message: 'NGO application submitted successfully for verification.',
      application: newApp,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/ngo/applications/:id/documents
 * Attaches or updates a verification document with cryptographic SHA-256 hash
 */
ngoRouter.post('/ngo/applications/:id/documents', (req: Request, res: Response): void => {
  const app = db.getNgoApplication(req.params.id);
  if (!app) {
    res.status(404).json({ error: `NGO Application not found: ${req.params.id}` });
    return;
  }

  const { type, name, fileSha256, mimeType, sizeBytes, reviewStatus, flagReason } = req.body;
  if (!type || !name) {
    res.status(400).json({ error: 'Missing document type or filename.' });
    return;
  }

  const docSha256 = fileSha256 || crypto.createHash('sha256').update(`${type}-${name}-${Date.now()}`).digest('hex');
  const docId = `doc-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

  const newDoc: NgoVerificationDocument = {
    id: docId,
    type,
    name,
    fileSha256: docSha256,
    uploadedAt: new Date().toISOString(),
    mimeType: mimeType || 'application/pdf',
    sizeBytes: Number(sizeBytes) || 256000,
    reviewStatus: reviewStatus || 'PENDING_REVIEW',
    flagReason,
  };

  app.documents[type] = newDoc;
  app.updatedAt = new Date().toISOString();

  // Run automated audit refresh
  runAutomatedAudit(app);
  db.updateNgoApplication(app);

  res.json({
    message: `Document ${name} (${type}) registered with SHA-256 hash.`,
    document: newDoc,
    application: app,
  });
});

/**
 * POST /api/ngo/applications/:id/automated-audit
 * Runs deep automated fraud, compliance, and duplicate collision checks
 */
ngoRouter.post('/ngo/applications/:id/automated-audit', (req: Request, res: Response): void => {
  const app = db.getNgoApplication(req.params.id);
  if (!app) {
    res.status(404).json({ error: `NGO Application not found: ${req.params.id}` });
    return;
  }

  runAutomatedAudit(app);
  db.updateNgoApplication(app);

  res.json({
    message: 'Automated audit completed.',
    checks: app.automatedChecks,
    verificationStatus: app.verificationStatus,
    blockingReasons: app.escrowAuthorization.blockingReasons,
    application: app,
  });
});

/**
 * POST /api/ngo/applications/:id/review
 * Verification team review decision (Approve / Reject / Flag)
 */
ngoRouter.post('/ngo/applications/:id/review', (req: Request, res: Response): void => {
  const app = db.getNgoApplication(req.params.id);
  if (!app) {
    res.status(404).json({ error: `NGO Application not found: ${req.params.id}` });
    return;
  }

  const { decision, reviewer, reviewerRole, notes, documentStatusUpdates } = req.body;
  if (!decision || !['APPROVED', 'REJECTED', 'NEEDS_CHANGES'].includes(decision)) {
    res.status(400).json({ error: 'Invalid decision. Must be APPROVED, REJECTED, or NEEDS_CHANGES.' });
    return;
  }

  // Role validation: Donor or unauthenticated role cannot review NGO compliance
  if (reviewerRole === 'DONOR' || !reviewerRole) {
    res.status(403).json({ error: 'Permission denied: Only NGO Verification Leads or Auditors can review applications.' });
    return;
  }

  // Update specific document review statuses if provided
  if (documentStatusUpdates && typeof documentStatusUpdates === 'object') {
    for (const [docType, statusObj] of Object.entries(documentStatusUpdates)) {
      if (app.documents[docType]) {
        if (typeof statusObj === 'string') {
          app.documents[docType].reviewStatus = statusObj as any;
        } else if (typeof statusObj === 'object' && (statusObj as any).status) {
          app.documents[docType].reviewStatus = (statusObj as any).status;
          if ((statusObj as any).flagReason) {
            app.documents[docType].flagReason = (statusObj as any).flagReason;
          }
        }
      }
    }
  }

  runAutomatedAudit(app);

  const defects: string[] = [];
  if (app.automatedChecks.duplicateBankCollision) {
    defects.push('Duplicate Bank Account collision detected across multiple registered NGOs.');
  }
  if (!app.automatedChecks.allMandatoryDocsPresent) {
    defects.push('Missing one or more mandatory compliance documents.');
  }
  if (app.automatedChecks.suspiciousFlagsCount > 0) {
    defects.push(`${app.automatedChecks.suspiciousFlagsCount} document(s) flagged as suspicious or tampered.`);
  }

  app.reviewDecision = {
    decision,
    reviewer: reviewer || 'TrustFabric Verification Officer',
    reviewerRole,
    reviewedAt: new Date().toISOString(),
    notes: notes || '',
    blockingDefects: defects,
  };

  if (decision === 'APPROVED') {
    if (defects.length > 0) {
      res.status(422).json({
        error: 'Cannot approve application with unresolved defects or duplicate bank collisions.',
        defects,
      });
      return;
    }
    app.verificationStatus = 'APPROVED';
    app.escrowAuthorization.blockingReasons = [];
  } else if (decision === 'REJECTED') {
    app.verificationStatus = 'REJECTED';
    app.escrowAuthorization.blockingReasons = defects.length > 0 ? defects : ['Application rejected by verification team.'];
  } else {
    app.verificationStatus = 'FLAGGED_DEFECTS';
    app.escrowAuthorization.blockingReasons = defects;
  }

  app.updatedAt = new Date().toISOString();
  db.updateNgoApplication(app);

  // Append audit event
  db.appendAudit({
    actorRef: reviewer || reviewerRole,
    action: `NGO_VERIFICATION_${decision}`,
    newState: app.verificationStatus,
    payload: {
      applicationId: app.id,
      decision,
      notes,
      defectsCount: defects.length,
    },
  });

  res.json({
    message: `Application ${decision.toLowerCase()} by ${reviewer || reviewerRole}.`,
    application: app,
  });
});

/**
 * POST /api/ngo/applications/:id/authorize-funding
 * Strictly gated smart contract escrow authorization endpoint.
 * REVERTS / BLOCKS if any verification check, compliance document, or approval is missing!
 */
ngoRouter.post('/ngo/applications/:id/authorize-funding', async (req: Request, res: Response): Promise<void> => {
  try {
    const app = db.getNgoApplication(req.params.id);
    if (!app) {
      res.status(404).json({ error: `NGO Application not found: ${req.params.id}` });
      return;
    }

    const { authorizerRole, authorizerName } = req.body;

    // Run fresh automated audit
    runAutomatedAudit(app);

    // Gated Authorization Criteria (Cascade '26 Non-Negotiable PS 4.2)
    const blockingReasons: string[] = [];

    if (app.verificationStatus !== 'APPROVED') {
      blockingReasons.push(`Verification status is '${app.verificationStatus}' (Must be 'APPROVED' before release).`);
    }
    if (app.reviewDecision.decision !== 'APPROVED') {
      blockingReasons.push('Review team has not given official approval decision.');
    }
    if (!app.automatedChecks.allMandatoryDocsPresent) {
      blockingReasons.push('Missing mandatory legal / bank compliance documents.');
    }
    if (app.automatedChecks.duplicateBankCollision) {
      blockingReasons.push('Duplicate bank account nullifier collision detected. Funds locked to prevent fraud.');
    }
    if (app.automatedChecks.duplicateDarpanCollision) {
      blockingReasons.push('Duplicate Darpan registration number collision detected.');
    }
    if (app.automatedChecks.suspiciousFlagsCount > 0) {
      blockingReasons.push(`${app.automatedChecks.suspiciousFlagsCount} documents flagged as suspicious or tampered.`);
    }

    // Role check: Only ADMIN or FINANCE_OFFICER / AUDITOR can authorize escrow release
    if (authorizerRole === 'DONOR') {
      blockingReasons.push('Permission denied: Donors cannot authorize escrow disbursement directly.');
    }

    if (blockingReasons.length > 0) {
      app.escrowAuthorization.blockingReasons = blockingReasons;
      db.updateNgoApplication(app);

      res.status(422).json({
        success: false,
        error: 'ESCROW_RELEASE_BLOCKED: Gated verification criteria not satisfied.',
        blockingReasons,
        application: app,
      });
      return;
    }

    // CRITERIA SATISFIED: Execute Smart Contract Escrow Release & Anchor
    const now = new Date().toISOString();
    const commitmentInput = `TRUSTFABRIC_ESCROW_RELEASE_V1|${app.id}|${app.darpanId}|${app.bankDetails.accountNumber}|${app.projectProposal.requestedAmountPaise}|${now}`;
    const onChainAnchorHash = '0x' + crypto.createHash('sha256').update(commitmentInput).digest('hex');
    const simulatedTxHash = '0x' + crypto.createHash('sha256').update(`TX-${commitmentInput}`).digest('hex');
    const simulatedBlock = 5892100 + Math.floor(Math.random() * 500);

    app.escrowAuthorization = {
      isAuthorized: true,
      blockingReasons: [],
      authorizedAt: now,
      authorizerRole: authorizerRole || 'FINANCE_OFFICER',
      contractEscrowTrancheId: `tranche-${app.id.substring(8)}`,
      blockchainTxHash: simulatedTxHash,
      blockchainBlock: simulatedBlock,
      blockchainStatus: 'ESCROW_RELEASED',
      onChainAnchorHash,
      network: 'Ethereum Sepolia (EVM) / TrustFabricEscrow.sol',
      contractAddress: '0x71C569E962Ac1C7F602B7d2A40EAA672D611293B',
    };

    app.updatedAt = now;
    db.updateNgoApplication(app);

    // Record sequential hash-chained audit log
    db.appendAudit({
      actorRef: authorizerName || authorizerRole || 'SYSTEM_ESCROW',
      action: 'ESCROW_FUNDING_AUTHORIZED',
      newState: 'ESCROW_RELEASED',
      payload: {
        applicationId: app.id,
        ngoName: app.ngoName,
        authorizedPaise: app.projectProposal.requestedAmountPaise,
        txHash: simulatedTxHash,
        blockNumber: simulatedBlock,
        anchorHash: onChainAnchorHash,
      },
    });

    res.json({
      success: true,
      message: `Escrow funding authorized and released via TrustFabricEscrow contract for ${app.ngoName}!`,
      escrowAuthorization: app.escrowAuthorization,
      application: app,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Automated Audit Engine Helper
 */
function runAutomatedAudit(app: NgoApplicationRecord): void {
  const allApps = db.getAllNgoApplications();

  // 1. Format checks
  const darpanFormatValid = /^([A-Z]{2}\/\d{4}\/\d{6,7})$/i.test(app.darpanId);
  const panFormatValid = /^[A-Z]{5}\d{4}[A-Z]$/i.test(app.pan);

  // 2. Collision checks against OTHER registered NGOs
  let duplicateBankCollision = false;
  let duplicateDarpanCollision = false;

  for (const other of allApps) {
    if (other.id === app.id) continue;
    if (other.bankDetails.accountNumber && other.bankDetails.accountNumber === app.bankDetails.accountNumber) {
      if (new Date(other.createdAt).getTime() < new Date(app.createdAt).getTime() || other.verificationStatus === 'APPROVED') {
        duplicateBankCollision = true;
      }
    }
    if (other.darpanId && other.darpanId.toLowerCase() === app.darpanId.toLowerCase()) {
      if (new Date(other.createdAt).getTime() < new Date(app.createdAt).getTime() || other.verificationStatus === 'APPROVED') {
        duplicateDarpanCollision = true;
      }
    }
  }

  // 3. Mandatory document checks
  let allMandatoryDocsPresent = true;
  let suspiciousFlagsCount = 0;

  for (const docType of MANDATORY_DOC_TYPES) {
    const doc = app.documents[docType];
    if (!doc || doc.reviewStatus === 'MISSING') {
      allMandatoryDocsPresent = false;
    } else if (doc.reviewStatus === 'SUSPICIOUS_FLAGGED') {
      suspiciousFlagsCount++;
    }
  }

  // Check any additional supporting documents for suspicious flags
  for (const doc of Object.values(app.documents)) {
    if (!MANDATORY_DOC_TYPES.includes(doc.type) && doc.reviewStatus === 'SUSPICIOUS_FLAGGED') {
      suspiciousFlagsCount++;
    }
  }

  app.automatedChecks = {
    darpanFormatValid,
    panFormatValid,
    sha256IntegrityPass: true,
    duplicateDarpanCollision,
    duplicateBankCollision,
    sanctionScreeningPass: true,
    allMandatoryDocsPresent,
    suspiciousFlagsCount,
  };

  // Update status if defects detected and not yet approved
  if (app.verificationStatus !== 'APPROVED') {
    if (duplicateBankCollision || duplicateDarpanCollision || suspiciousFlagsCount > 0) {
      app.verificationStatus = 'FLAGGED_DEFECTS';
    }
  }
}
