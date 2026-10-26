import fs from 'fs';
import path from 'path';
import { EvidenceVaultService, type EvidenceRecord } from '../services/evidenceVaultService.js';
import { IpfsStorageService } from '../services/ipfsStorageService.js';

export interface MigrationItem {
  evidenceId: string;
  storageKey: string;
  originalFilename: string;
  sha256: string;
  previousProvider: string;
  newProvider: 'ipfs_storage';
  ipfsCid: string;
  ipfsCidV0: string;
  migratedAt: string;
  verified: boolean;
}

export interface MigrationReport {
  totalScanned: number;
  totalMigrated: number;
  totalAlreadyMigrated: number;
  totalFailed: number;
  items: MigrationItem[];
  startedAt: string;
  completedAt: string;
  status: 'COMPLETED' | 'ROLLED_BACK' | 'FAILED';
}

export class SupabaseToIpfsMigrator {
  private vaultService: EvidenceVaultService;
  private ipfsService: IpfsStorageService;
  private ledgerPath: string;

  constructor() {
    this.vaultService = EvidenceVaultService.getInstance();
    this.ipfsService = IpfsStorageService.getInstance();
    const vaultDir = path.resolve(process.cwd(), '.evidence_vault');
    if (!fs.existsSync(vaultDir)) {
      fs.mkdirSync(vaultDir, { recursive: true });
    }
    this.ledgerPath = path.join(vaultDir, 'supabase_to_ipfs_migration.json');
  }

  /**
   * Executes safe migration from Supabase Storage / Local Vault to Decentralized IPFS
   */
  public async migrate(): Promise<MigrationReport> {
    const startedAt = new Date().toISOString();
    const metadataPath = path.resolve(process.cwd(), '.evidence_vault', 'evidence_metadata.json');

    if (!fs.existsSync(metadataPath)) {
      return {
        totalScanned: 0,
        totalMigrated: 0,
        totalAlreadyMigrated: 0,
        totalFailed: 0,
        items: [],
        startedAt,
        completedAt: new Date().toISOString(),
        status: 'COMPLETED',
      };
    }

    const raw = fs.readFileSync(metadataPath, 'utf8');
    const records: EvidenceRecord[] = JSON.parse(raw);

    const migratedItems: MigrationItem[] = [];
    let totalAlreadyMigrated = 0;
    let totalFailed = 0;

    for (const record of records) {
      if (record.storageProvider === 'ipfs_storage' && record.ipfsCid && this.ipfsService.isValidCid(record.ipfsCid)) {
        totalAlreadyMigrated++;
        continue;
      }

      try {
        // 1. Read existing bytes
        const buffer = await this.vaultService.getRawBuffer(record.storageKey);

        // 2. Upload and pin to IPFS
        const uploadRes = await this.ipfsService.uploadFile({
          buffer,
          filename: record.originalFilename,
          mimeType: record.mimeType,
        });

        // 3. Verify content integrity immediately
        const verified = this.ipfsService.verifyContentIntegrity(buffer, uploadRes.cid);
        if (!verified) {
          throw new Error(`CID verification failed post-upload for ${record.storageKey}`);
        }

        const prevProvider = record.storageProvider;

        // 4. Update record
        record.storageProvider = 'ipfs_storage';
        record.ipfsCid = uploadRes.cid;
        record.ipfsGatewayUrl = uploadRes.gatewayUrl;
        record.updatedAt = new Date().toISOString();

        migratedItems.push({
          evidenceId: record.id,
          storageKey: record.storageKey,
          originalFilename: record.originalFilename,
          sha256: record.sha256,
          previousProvider: prevProvider,
          newProvider: 'ipfs_storage',
          ipfsCid: uploadRes.cid,
          ipfsCidV0: uploadRes.cidV0,
          migratedAt: new Date().toISOString(),
          verified,
        });
      } catch (err: any) {
        console.error(`[Migration Error] Failed to migrate ${record.id} (${record.storageKey}): ${err.message}`);
        totalFailed++;
      }
    }

    // Persist updated evidence metadata
    fs.writeFileSync(metadataPath, JSON.stringify(records, null, 2), 'utf8');

    const report: MigrationReport = {
      totalScanned: records.length,
      totalMigrated: migratedItems.length,
      totalAlreadyMigrated,
      totalFailed,
      items: migratedItems,
      startedAt,
      completedAt: new Date().toISOString(),
      status: totalFailed > 0 && migratedItems.length === 0 ? 'FAILED' : 'COMPLETED',
    };

    // Save migration audit ledger
    fs.writeFileSync(this.ledgerPath, JSON.stringify(report, null, 2), 'utf8');

    return report;
  }

  /**
   * Safely rolls back migrated records to their previous storage state
   */
  public async rollback(): Promise<{
    success: boolean;
    totalRolledBack: number;
    error?: string;
  }> {
    if (!fs.existsSync(this.ledgerPath)) {
      return { success: false, totalRolledBack: 0, error: 'No previous migration ledger found to roll back.' };
    }

    const reportRaw = fs.readFileSync(this.ledgerPath, 'utf8');
    const report: MigrationReport = JSON.parse(reportRaw);

    const metadataPath = path.resolve(process.cwd(), '.evidence_vault', 'evidence_metadata.json');
    if (!fs.existsSync(metadataPath)) {
      return { success: false, totalRolledBack: 0, error: 'Evidence metadata file missing.' };
    }

    const records: EvidenceRecord[] = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    const itemMap = new Map<string, MigrationItem>();
    for (const item of report.items) {
      itemMap.set(item.evidenceId, item);
    }

    let rolledBackCount = 0;
    for (const record of records) {
      const migrated = itemMap.get(record.id);
      if (migrated) {
        record.storageProvider = migrated.previousProvider as any;
        delete record.ipfsCid;
        delete record.ipfsGatewayUrl;
        record.updatedAt = new Date().toISOString();
        rolledBackCount++;
      }
    }

    fs.writeFileSync(metadataPath, JSON.stringify(records, null, 2), 'utf8');

    report.status = 'ROLLED_BACK';
    fs.writeFileSync(this.ledgerPath, JSON.stringify(report, null, 2), 'utf8');

    return {
      success: true,
      totalRolledBack: rolledBackCount,
    };
  }

  public getMigrationLedger(): MigrationReport | null {
    if (!fs.existsSync(this.ledgerPath)) return null;
    return JSON.parse(fs.readFileSync(this.ledgerPath, 'utf8'));
  }
}

// Standalone CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const migrator = new SupabaseToIpfsMigrator();
  const isRollback = process.argv.includes('--rollback');

  if (isRollback) {
    console.log('🔄 Initiating TrustFabric Storage Rollback from IPFS to previous provider...');
    migrator.rollback().then((res) => {
      console.log(`✅ Rollback finished: ${res.totalRolledBack} records restored.`);
      process.exit(res.success ? 0 : 1);
    });
  } else {
    console.log('🚀 Initiating TrustFabric Supabase Storage to IPFS Migration...');
    migrator.migrate().then((report) => {
      console.log('----------------------------------------------------------');
      console.log(`Migration Status:       ${report.status}`);
      console.log(`Total Documents:        ${report.totalScanned}`);
      console.log(`Successfully Migrated:  ${report.totalMigrated}`);
      console.log(`Already on IPFS:        ${report.totalAlreadyMigrated}`);
      console.log(`Failed:                 ${report.totalFailed}`);
      console.log('----------------------------------------------------------');
      process.exit(report.status === 'COMPLETED' ? 0 : 1);
    });
  }
}
