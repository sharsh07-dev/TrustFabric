import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { TesseractOcrEngine } from '../ocr/tesseractOcrEngine.js';
import { ForensicsService } from '../forensics/forensicsService.js';
import { DuplicateDetectionService } from './duplicateDetectionService.js';
import { EvidenceVaultService } from '../evidenceVaultService.js';
import { RealtimeSocketService } from '../realtimeSocketService.js';

export interface EvidenceJobData {
  evidenceId: string;
  storageKey: string;
  organizationId: string;
  mimeType: string;
  filename: string;
  sha256: string;
  enqueuedAt: string;
}

export class EvidenceQueueService {
  private static instance: EvidenceQueueService;
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private redisClient: IORedis | null = null;
  private isRedisActive: boolean = false;

  private ocrEngine: TesseractOcrEngine;
  private forensicsService: ForensicsService;
  private duplicateService: DuplicateDetectionService;

  // In-process fallback queue for zero-dependency execution and testing
  private inProcessJobs: Map<string, { data: EvidenceJobData; status: string }> = new Map();

  private constructor() {
    this.ocrEngine = new TesseractOcrEngine();
    this.forensicsService = ForensicsService.getInstance();
    this.duplicateService = DuplicateDetectionService.getInstance();

    this.initBullMQ();
  }

  public static getInstance(): EvidenceQueueService {
    if (!EvidenceQueueService.instance) {
      EvidenceQueueService.instance = new EvidenceQueueService();
    }
    return EvidenceQueueService.instance;
  }

  private async initBullMQ(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

    try {
      this.redisClient = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: () => null, // don't hang if offline
        connectTimeout: 1000,
      });

      this.redisClient.on('error', () => {
        this.isRedisActive = false;
      });

      this.redisClient.on('connect', () => {
        this.isRedisActive = true;
      });

      // Quick ping test
      await Promise.race([
        this.redisClient.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 800)),
      ]);

      this.isRedisActive = true;
      this.queue = new Queue('evidence-ocr-pipeline', {
        connection: this.redisClient,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      });

      this.worker = new Worker(
        'evidence-ocr-pipeline',
        async (job: Job<EvidenceJobData>) => {
          await this.processEvidenceJob(job.data);
        },
        {
          connection: this.redisClient,
          concurrency: 10,
        }
      );

      console.log('[EvidenceQueue] BullMQ Redis pipeline active with 10 worker concurrency');
    } catch {
      this.isRedisActive = false;
      // In-process asynchronous queue will handle jobs
    }
  }

  /**
   * Enqueues an evidence document for asynchronous OCR and Forensics processing
   */
  public async enqueueEvidence(data: EvidenceJobData): Promise<{ jobId: string; mode: 'bullmq' | 'in_process' }> {
    const jobId = `job-ocr-${data.evidenceId}`;

    if (this.isRedisActive && this.queue) {
      try {
        await this.queue.add('process-ocr', data, { jobId });
        return { jobId, mode: 'bullmq' };
      } catch (err: any) {
        console.warn(`[EvidenceQueue] Falling back to in-process async pipeline: ${err.message}`);
      }
    }

    // In-process asynchronous worker execution (non-blocking)
    this.inProcessJobs.set(jobId, { data, status: 'QUEUED' });
    setImmediate(async () => {
      try {
        await this.processEvidenceJob(data);
      } catch (err: any) {
        console.error(`[EvidenceQueue] In-process job ${jobId} failed:`, err);
      }
    });

    return { jobId, mode: 'in_process' };
  }

  /**
   * Core processing worker: runs OCR, Forensics, Duplicate Detection, and state persistence
   */
  public async processEvidenceJob(data: EvidenceJobData): Promise<void> {
    const vault = EvidenceVaultService.getInstance();
    const evidence = vault.getEvidence(data.evidenceId);
    if (!evidence) {
      console.warn(`[EvidenceQueue] Evidence ${data.evidenceId} not found in store`);
      return;
    }

    try {
      // 1. Transition: OCR_PROCESSING
      vault.updatePipelineStatus(data.evidenceId, {
        pipelineStatus: 'OCR_PROCESSING',
        ocrStatus: 'PROCESSING',
      });

      const buffer = await vault.getRawBuffer(data.storageKey);

      // 2. Run OCR Extraction
      const ocrResult = await this.ocrEngine.extract(buffer, data.mimeType, data.filename);

      // 3. Transition: FORENSIC_ANALYSIS
      vault.updatePipelineStatus(data.evidenceId, {
        pipelineStatus: 'FORENSIC_ANALYSIS',
        ocrStatus: 'COMPLETED',
      });

      // 4. Run Explainable Forensics
      const forensicsResult = await this.forensicsService.analyzeDocument({
        buffer,
        mimeType: data.mimeType,
        filename: data.filename,
        ocrResult,
      });

      // 5. Run Duplicate Detection against existing organization evidence
      const existingList = vault.getAllEvidenceForDuplicates();
      const duplicateResult = this.duplicateService.checkDuplicates({
        evidenceId: data.evidenceId,
        sha256: data.sha256,
        organizationId: data.organizationId,
        extraction: ocrResult,
        existingRecords: existingList,
      });

      // 6. Compute Final Pipeline Status
      const needsReview =
        duplicateResult.status === 'CONFIRMED_DUPLICATE' ||
        duplicateResult.status === 'POSSIBLE_DUPLICATE' ||
        forensicsResult.overallRisk === 'HIGH' ||
        !ocrResult.arithmeticCheck.passed;

      const finalStatus = needsReview ? 'REVIEW_REQUIRED' : 'COMPLETED';

      // 7. Persist complete results
      vault.saveProcessingResults(data.evidenceId, {
        pipelineStatus: finalStatus,
        ocrStatus: 'COMPLETED',
        duplicateStatus: duplicateResult.status,
        forensicRiskLevel: forensicsResult.overallRisk,
        extraction: ocrResult,
        forensics: forensicsResult,
        duplicateCandidates: duplicateResult.candidates,
      });

      // 8. Broadcast real-time notification to auditor & NGO rooms
      try {
        const realtime = RealtimeSocketService.getInstance();
        const io = realtime.getIO();
        if (io) {
          io.to(`org:${data.organizationId}`).emit('evidence:processed', {
            evidenceId: data.evidenceId,
            pipelineStatus: finalStatus,
            duplicateStatus: duplicateResult.status,
            forensicRiskLevel: forensicsResult.overallRisk,
            vendorName: ocrResult.fields.vendorName?.value,
            totalAmountPaise: ocrResult.fields.totalAmountPaise?.value,
          });
          io.to('admin:all').emit('evidence:processed', {
            evidenceId: data.evidenceId,
            organizationId: data.organizationId,
            pipelineStatus: finalStatus,
            duplicateStatus: duplicateResult.status,
            forensicRiskLevel: forensicsResult.overallRisk,
          });
        }
      } catch (rtErr: any) {
        console.warn(`[EvidenceQueue] Real-time notification notice: ${rtErr.message}`);
      }
    } catch (err: any) {
      console.error(`[EvidenceQueue] Processing failed for ${data.evidenceId}:`, err);
      vault.updatePipelineStatus(data.evidenceId, {
        pipelineStatus: 'FAILED',
        ocrStatus: 'FAILED',
      });
    }
  }

  public getQueueStatus(): {
    mode: 'bullmq' | 'in_process';
    redisConnected: boolean;
    inProcessJobsCount: number;
  } {
    return {
      mode: this.isRedisActive ? 'bullmq' : 'in_process',
      redisConnected: this.isRedisActive,
      inProcessJobsCount: this.inProcessJobs.size,
    };
  }
}
