import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { AuthUser, UserRole } from '../types.js';
import { FileSignatureValidator } from './evidence/fileSignatureValidator.js';
import type { OcrExtractionResult } from './ocr/ocrEngine.js';
import type { ForensicAnalysisResult } from './forensics/forensicsService.js';
import type { DuplicateCandidate, ExistingEvidenceRecord } from './evidence/duplicateDetectionService.js';
import { EvidenceQueueService } from './evidence/evidenceQueueService.js';

export interface EvidenceRecord {
  id: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  organizationId: string;
  uploaderId: string;
  uploaderRole: UserRole;
  claimId?: string;
  verificationStatus: 'VERIFIED' | 'TAMPERED' | 'PENDING';
  pipelineStatus: 'UPLOADED' | 'QUEUED' | 'OCR_PROCESSING' | 'OCR_COMPLETED' | 'FORENSIC_ANALYSIS' | 'REVIEW_REQUIRED' | 'COMPLETED' | 'FAILED';
  ocrStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  duplicateStatus: 'NO_MATCH_FOUND' | 'POSSIBLE_DUPLICATE' | 'CONFIRMED_DUPLICATE' | 'UNRESOLVED';
  forensicRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'INCONCLUSIVE';
  reviewDecision: 'PENDING' | 'GENUINE' | 'SUSPICIOUS' | 'INCONCLUSIVE';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  storageProvider: 'supabase_storage' | 'secure_local_vault';
  uploadedAt: string;
  updatedAt: string;
}

export interface UploadEvidenceOptions {
  buffer: Buffer;
  originalFilename: string;
  mimeType: string;
  organizationId: string;
  user: AuthUser;
  claimId?: string;
  clientSuppliedSha256?: string;
}

export interface SignedUrlResult {
  signedUrl: string;
  expiresAt: string;
  expiresInSeconds: number;
  storageKey: string;
  provider: 'supabase_storage' | 'secure_local_vault';
}

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit
const DEFAULT_TTL_SECONDS = 300; // 5 minutes

export class EvidenceVaultService {
  private static instance: EvidenceVaultService;
  private supabase: SupabaseClient | null = null;
  private bucketName: string;
  private isSupabaseConfigured: boolean = false;
  private vaultStorageDir: string;
  private metadataStore: Map<string, EvidenceRecord> = new Map();
  private persistentStatePath: string;

  private extractions: Map<string, OcrExtractionResult> = new Map();
  private forensics: Map<string, ForensicAnalysisResult> = new Map();
  private duplicateCandidates: Map<string, DuplicateCandidate[]> = new Map();
  private userCorrections: Map<string, any[]> = new Map();

  private constructor() {
    this.bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'ngo-evidence';
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    // Initialize Supabase Storage client if service role key is provided
    if (supabaseUrl && serviceRoleKey && !serviceRoleKey.includes('[YOUR-')) {
      try {
        this.supabase = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        this.isSupabaseConfigured = true;
      } catch (err) {
        this.isSupabaseConfigured = false;
      }
    }

    // Local vault storage directory for local persistence and fallback
    this.vaultStorageDir = path.resolve(process.cwd(), '.evidence_vault');
    if (!fs.existsSync(this.vaultStorageDir)) {
      fs.mkdirSync(this.vaultStorageDir, { recursive: true });
    }

    this.persistentStatePath = path.join(this.vaultStorageDir, 'evidence_metadata.json');
    this.loadPersistentMetadata();
  }

  public static getInstance(): EvidenceVaultService {
    if (!EvidenceVaultService.instance) {
      EvidenceVaultService.instance = new EvidenceVaultService();
    }
    return EvidenceVaultService.instance;
  }

  private loadPersistentMetadata(): void {
    try {
      if (fs.existsSync(this.persistentStatePath)) {
        const raw = fs.readFileSync(this.persistentStatePath, 'utf8');
        const list: EvidenceRecord[] = JSON.parse(raw);
        for (const item of list) {
          this.metadataStore.set(item.id, item);
        }
      }
    } catch {
      // Ignore initial boot empty state
    }
  }

  private savePersistentMetadata(): void {
    try {
      const list = Array.from(this.metadataStore.values());
      fs.writeFileSync(this.persistentStatePath, JSON.stringify(list, null, 2), 'utf8');
    } catch {
      // Best-effort persistence
    }
  }

  public getStatus(): {
    configured: boolean;
    provider: 'supabase_storage' | 'secure_local_vault';
    bucket: string;
    supabaseUrl: string;
    documentsCount: number;
    maxSizeBytes: number;
    allowedMimes: string[];
    signedUrlTtlSeconds: number;
  } {
    return {
      configured: this.isSupabaseConfigured,
      provider: this.isSupabaseConfigured ? 'supabase_storage' : 'secure_local_vault',
      bucket: this.bucketName,
      supabaseUrl: process.env.SUPABASE_URL || 'https://rolfeyepqzricdgfprev.supabase.co',
      documentsCount: this.metadataStore.size,
      maxSizeBytes: MAX_FILE_SIZE_BYTES,
      allowedMimes: Array.from(ALLOWED_MIME_TYPES),
      signedUrlTtlSeconds: DEFAULT_TTL_SECONDS,
    };
  }

  /**
   * Uploads evidence bytes with server-computed SHA-256 and strict validation
   */
  public async uploadEvidence(options: UploadEvidenceOptions): Promise<{
    evidence: EvidenceRecord;
    hashMismatchDetected: boolean;
  }> {
    const { buffer, originalFilename, mimeType, organizationId, user, claimId, clientSuppliedSha256 } = options;

    // 1. Authorization check: Donors cannot upload vendor receipts or compliance evidence
    if (user.role === 'DONOR') {
      const err: any = new Error('Forbidden: Donors are not authorized to upload compliance or vendor receipts.');
      err.statusCode = 403;
      err.code = 'ROLE_FORBIDDEN';
      throw err;
    }

    // 2. MIME type & file signature validation (detects spoofed extensions)
    if (!ALLOWED_MIME_TYPES.has(mimeType.toLowerCase())) {
      const err: any = new Error(`Unsupported file type: ${mimeType}. Allowed formats: PDF, JPEG, PNG, WEBP`);
      err.statusCode = 415;
      err.code = 'UNSUPPORTED_MEDIA_TYPE';
      throw err;
    }

    const sigResult = FileSignatureValidator.validate(buffer);
    if (!sigResult.valid) {
      const err: any = new Error(`File signature validation failed: ${sigResult.error}`);
      err.statusCode = 400;
      err.code = 'INVALID_FILE_SIGNATURE';
      throw err;
    }

    // 3. File size validation
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      const err: any = new Error(`File size ${buffer.length} bytes exceeds maximum limit of 10 MB.`);
      err.statusCode = 413;
      err.code = 'PAYLOAD_TOO_LARGE';
      throw err;
    }

    if (buffer.length === 0) {
      const err: any = new Error('Empty file received.');
      err.statusCode = 400;
      err.code = 'EMPTY_FILE';
      throw err;
    }

    // 4. Server calculates SHA-256 independently
    const serverSha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // 5. Compare client-supplied hash if provided
    let hashMismatchDetected = false;
    if (clientSuppliedSha256 && clientSuppliedSha256.toLowerCase() !== serverSha256.toLowerCase()) {
      hashMismatchDetected = true;
    }

    // 6. Generate non-guessable, scoped storage key
    const sanitizedOrg = organizationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const sanitizedFilename = path.basename(originalFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const evidenceId = `evid-${crypto.randomUUID()}`;
    const storageKey = `${sanitizedOrg}/${evidenceId}-${sanitizedFilename}`;

    const now = new Date().toISOString();
    let storageProvider: 'supabase_storage' | 'secure_local_vault' = 'secure_local_vault';

    // 7. Store in Supabase Storage or Local Vault
    if (this.isSupabaseConfigured && this.supabase) {
      try {
        const { error: uploadErr } = await this.supabase.storage
          .from(this.bucketName)
          .upload(storageKey, buffer, {
            contentType: mimeType,
            upsert: false,
          });

        if (uploadErr) {
          throw new Error(`Supabase Storage upload error: ${uploadErr.message}`);
        }
        storageProvider = 'supabase_storage';
      } catch (err: any) {
        // Fall back to local vault if cloud fails
        this.saveToLocalVault(storageKey, buffer);
        storageProvider = 'secure_local_vault';
      }
    } else {
      // Local vault fallback
      this.saveToLocalVault(storageKey, buffer);
      storageProvider = 'secure_local_vault';
    }

    const record: EvidenceRecord = {
      id: evidenceId,
      storageKey,
      originalFilename,
      mimeType: sigResult.detectedMimeType || mimeType,
      sizeBytes: buffer.length,
      sha256: serverSha256,
      organizationId,
      uploaderId: user.sub,
      uploaderRole: user.role,
      claimId,
      verificationStatus: hashMismatchDetected ? 'TAMPERED' : 'VERIFIED',
      pipelineStatus: 'QUEUED',
      ocrStatus: 'PENDING',
      duplicateStatus: 'NO_MATCH_FOUND',
      forensicRiskLevel: 'LOW',
      reviewDecision: 'PENDING',
      storageProvider,
      uploadedAt: now,
      updatedAt: now,
    };

    this.metadataStore.set(evidenceId, record);
    this.savePersistentMetadata();

    // 8. Asynchronously enqueue for background OCR & Forensics pipeline
    try {
      const queue = EvidenceQueueService.getInstance();
      await queue.enqueueEvidence({
        evidenceId,
        storageKey,
        organizationId,
        mimeType: sigResult.detectedMimeType || mimeType,
        filename: originalFilename,
        sha256: serverSha256,
        enqueuedAt: now,
      });
    } catch (qErr: any) {
      console.warn(`[EvidenceVault] Background processing enqueue note: ${qErr.message}`);
    }

    return {
      evidence: record,
      hashMismatchDetected,
    };
  }

  private saveToLocalVault(storageKey: string, buffer: Buffer): void {
    const fullPath = path.join(this.vaultStorageDir, storageKey);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, buffer);
  }

  /**
   * Retrieves raw file buffer from storage (for downloading or verification)
   */
  public async getRawBuffer(storageKey: string): Promise<Buffer> {
    if (this.isSupabaseConfigured && this.supabase) {
      const { data, error } = await this.supabase.storage.from(this.bucketName).download(storageKey);
      if (error || !data) {
        throw new Error(`Failed to download from Supabase Storage: ${error?.message || 'Object missing'}`);
      }
      return Buffer.from(await data.arrayBuffer());
    }

    const localPath = path.join(this.vaultStorageDir, storageKey);
    if (!fs.existsSync(localPath)) {
      throw new Error(`Evidence file not found in storage vault: ${storageKey}`);
    }
    return fs.readFileSync(localPath);
  }

  /**
   * Generates a 5-minute (300-second) signed URL with strict authorization enforcement
   */
  public async generateSignedUrl(
    evidenceId: string,
    user: AuthUser,
    expiresInSeconds: number = DEFAULT_TTL_SECONDS,
    hostBaseUrl: string = 'http://localhost:5001'
  ): Promise<SignedUrlResult> {
    const evidence = this.metadataStore.get(evidenceId);
    if (!evidence) {
      const err: any = new Error(`Evidence document not found: ${evidenceId}`);
      err.statusCode = 404;
      throw err;
    }

    // 1. Strict Donor Guard: Public donors can NEVER access raw evidence bytes
    if (user.role === 'DONOR') {
      const err: any = new Error('Forbidden: Donors are restricted from retrieving raw vendor receipts or compliance evidence.');
      err.statusCode = 403;
      err.code = 'ROLE_FORBIDDEN';
      throw err;
    }

    // 2. Cross-Organization Boundary Check:
    // Only ADMIN and AUDITOR can inspect documents across all organizations.
    // NGO personnel (FIELD_WORKER, VENDOR) can only inspect documents belonging to their own organization.
    const isGlobalAuditor = user.role === 'ADMIN' || user.role === 'AUDITOR';
    if (!isGlobalAuditor && user.organizationId && user.organizationId !== evidence.organizationId) {
      const err: any = new Error(`Forbidden: User does not belong to organization ${evidence.organizationId}.`);
      err.statusCode = 403;
      err.code = 'CROSS_ORG_ACCESS_DENIED';
      throw err;
    }

    const expTime = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const expiresAt = new Date(expTime * 1000).toISOString();

    // 3. Supabase signed URL or Vault HMAC signed token
    if (evidence.storageProvider === 'supabase_storage' && this.isSupabaseConfigured && this.supabase) {
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .createSignedUrl(evidence.storageKey, expiresInSeconds);

      if (error || !data) {
        throw new Error(`Supabase createSignedUrl error: ${error?.message || 'Unknown'}`);
      }

      return {
        signedUrl: data.signedUrl,
        expiresAt,
        expiresInSeconds,
        storageKey: evidence.storageKey,
        provider: 'supabase_storage',
      };
    }

    // Vault secure signed URL: token = HMAC(storageKey:expTime, secret)
    const secret = process.env.JWT_SECRET || 'trustfabric_vault_token_secret_cascade26';
    const sig = crypto
      .createHmac('sha256', secret)
      .update(`${evidence.id}:${expTime}`)
      .digest('hex');

    const signedUrl = `${hostBaseUrl}/api/evidence/${evidence.id}/raw?token=${sig}&exp=${expTime}`;

    return {
      signedUrl,
      expiresAt,
      expiresInSeconds,
      storageKey: evidence.storageKey,
      provider: 'secure_local_vault',
    };
  }

  /**
   * Verifies that the signed URL token is valid and unexpired
   */
  public verifySignedToken(evidenceId: string, token: string, expStr: string): boolean {
    const expTime = parseInt(expStr, 10);
    const now = Math.floor(Date.now() / 1000);

    if (isNaN(expTime) || now > expTime) {
      return false; // Token expired
    }

    const secret = process.env.JWT_SECRET || 'trustfabric_vault_token_secret_cascade26';
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${evidenceId}:${expTime}`)
      .digest('hex');

    const tokenBuf = Buffer.from(token);
    const expectedBuf = Buffer.from(expectedSig);

    if (tokenBuf.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(tokenBuf, expectedBuf);
  }

  /**
   * Verifies file integrity against tampering
   */
  public async verifyFileIntegrity(evidenceId: string): Promise<{
    verified: boolean;
    recordedSha256: string;
    computedSha256: string;
    tampered: boolean;
  }> {
    const evidence = this.metadataStore.get(evidenceId);
    if (!evidence) {
      throw new Error(`Evidence document not found: ${evidenceId}`);
    }

    const currentBytes = await this.getRawBuffer(evidence.storageKey);
    const computedSha256 = crypto.createHash('sha256').update(currentBytes).digest('hex');
    const tampered = computedSha256 !== evidence.sha256;

    if (tampered && evidence.verificationStatus !== 'TAMPERED') {
      evidence.verificationStatus = 'TAMPERED';
      evidence.updatedAt = new Date().toISOString();
      this.savePersistentMetadata();
    }

    return {
      verified: !tampered,
      recordedSha256: evidence.sha256,
      computedSha256,
      tampered,
    };
  }

  public getEvidence(id: string): EvidenceRecord | undefined {
    return this.metadataStore.get(id);
  }

  /**
   * Lists evidence records filtered by user's authorized scope
   */
  public listEvidence(user: AuthUser): EvidenceRecord[] {
    // Donors have zero evidence access
    if (user.role === 'DONOR') {
      return [];
    }

    // Auditors and Admins see everything
    if (user.role === 'ADMIN' || user.role === 'AUDITOR') {
      return Array.from(this.metadataStore.values());
    }

    // NGO personnel see only their organization's records
    return Array.from(this.metadataStore.values()).filter(
      (doc) => doc.organizationId === user.organizationId
    );
  }

  // --- OCR Extraction, Forensics & Duplicate Candidate Accessors ---

  public getExtraction(id: string): OcrExtractionResult | null {
    return this.extractions.get(id) || null;
  }

  public getForensics(id: string): ForensicAnalysisResult | null {
    return this.forensics.get(id) || null;
  }

  public getDuplicates(id: string): DuplicateCandidate[] {
    return this.duplicateCandidates.get(id) || [];
  }

  public saveProcessingResults(
    evidenceId: string,
    results: {
      pipelineStatus: EvidenceRecord['pipelineStatus'];
      ocrStatus: EvidenceRecord['ocrStatus'];
      duplicateStatus: EvidenceRecord['duplicateStatus'];
      forensicRiskLevel: EvidenceRecord['forensicRiskLevel'];
      extraction: OcrExtractionResult;
      forensics: ForensicAnalysisResult;
      duplicateCandidates: DuplicateCandidate[];
    }
  ): void {
    const doc = this.metadataStore.get(evidenceId);
    if (doc) {
      doc.pipelineStatus = results.pipelineStatus;
      doc.ocrStatus = results.ocrStatus;
      doc.duplicateStatus = results.duplicateStatus;
      doc.forensicRiskLevel = results.forensicRiskLevel;
      doc.updatedAt = new Date().toISOString();
      this.savePersistentMetadata();
    }
    this.extractions.set(evidenceId, results.extraction);
    this.forensics.set(evidenceId, results.forensics);
    this.duplicateCandidates.set(evidenceId, results.duplicateCandidates);
  }

  public updatePipelineStatus(evidenceId: string, updates: Partial<EvidenceRecord>): void {
    const doc = this.metadataStore.get(evidenceId);
    if (doc) {
      Object.assign(doc, updates, { updatedAt: new Date().toISOString() });
      this.savePersistentMetadata();
    }
  }

  public recordReviewDecision(
    id: string,
    decision: 'GENUINE' | 'SUSPICIOUS' | 'INCONCLUSIVE',
    reviewer: AuthUser,
    notes?: string
  ): EvidenceRecord {
    const doc = this.metadataStore.get(id);
    if (!doc) {
      throw new Error(`Evidence document not found: ${id}`);
    }
    doc.reviewDecision = decision;
    doc.reviewedBy = reviewer.sub;
    doc.reviewedAt = new Date().toISOString();
    doc.reviewNotes = notes;
    doc.pipelineStatus = 'COMPLETED';
    doc.updatedAt = new Date().toISOString();
    this.savePersistentMetadata();
    return doc;
  }

  public applyCorrection(
    id: string,
    corrections: Record<string, any>,
    reviewer: AuthUser
  ): {
    success: boolean;
    extraction: OcrExtractionResult;
  } {
    const extraction = this.extractions.get(id);
    if (!extraction) {
      throw new Error(`No extraction available for document: ${id}`);
    }

    const existingCorrections = this.userCorrections.get(id) || [];
    const now = new Date().toISOString();

    for (const [key, val] of Object.entries(corrections)) {
      const prevField = (extraction.fields as any)[key];
      const prevVal = prevField ? prevField.value : undefined;

      existingCorrections.push({
        field: key,
        previousValue: prevVal,
        correctedValue: val,
        correctedBy: reviewer.sub,
        correctedAt: now,
      });

      (extraction.fields as any)[key] = {
        value: val,
        confidence: 1.0,
        status: 'USER_CONFIRMED',
      };
    }

    this.userCorrections.set(id, existingCorrections);
    return { success: true, extraction };
  }

  public getUserCorrections(id: string): any[] {
    return this.userCorrections.get(id) || [];
  }

  public getAllEvidenceForDuplicates(): ExistingEvidenceRecord[] {
    const records: ExistingEvidenceRecord[] = [];
    for (const doc of this.metadataStore.values()) {
      const ext = this.extractions.get(doc.id);
      records.push({
        id: doc.id,
        sha256: doc.sha256,
        organizationId: doc.organizationId,
        vendorName: ext?.fields?.vendorName?.value,
        vendorGstin: ext?.fields?.vendorGstin?.value,
        invoiceNumber: ext?.fields?.invoiceNumber?.value,
        invoiceDate: ext?.fields?.invoiceDate?.value,
        totalAmountPaise: ext?.fields?.totalAmountPaise?.value,
      });
    }
    return records;
  }
}
