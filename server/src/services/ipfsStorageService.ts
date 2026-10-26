import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface IpfsUploadResult {
  cid: string;
  cidV0: string;
  sizeBytes: number;
  sha256: string;
  mimeType: string;
  gatewayUrl: string;
  pinned: boolean;
  pinService: string;
  timestamp: string;
}

export interface IpfsStatus {
  enabled: boolean;
  configured: boolean;
  provider: 'pinata' | 'ipfs_http_api' | 'local_content_addressed_vault';
  primaryGateway: string;
  fallbackGateways: string[];
  pinnedItemsCount: number;
  totalBytesStored: number;
  supportedCidVersions: ('v0' | 'v1')[];
  maxUploadSizeBytes: number;
}

export interface BatchManifest {
  manifestVersion: string;
  batchId: string;
  merkleRoot: string;
  leafCount: number;
  relayerAddress: string;
  network: string;
  chainId: number;
  createdAt: string;
  leaves: Array<{
    commitmentId: string;
    evidenceDigest: string;
    ownerAddress: string;
    ipfsCid?: string;
  }>;
}

// RFC4648 Base32 alphabet (lowercase)
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

// Bitcoin / IPFS Base58 alphabet
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

export class IpfsStorageService {
  private static instance: IpfsStorageService;

  private primaryGateway: string;
  private fallbackGateways: string[];
  private pinataJwt?: string;
  private pinataApiKey?: string;
  private pinataSecretKey?: string;
  private ipfsApiUrl?: string;

  private ipfsStorageDir: string;
  private ipfsRegistryPath: string;
  private pinnedRegistry: Map<string, {
    cid: string;
    filename: string;
    sizeBytes: number;
    mimeType: string;
    sha256: string;
    pinnedAt: string;
  }> = new Map();

  private constructor() {
    this.primaryGateway = process.env.IPFS_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs';
    this.fallbackGateways = [
      'https://ipfs.io/ipfs',
      'https://cloudflare-ipfs.com/ipfs',
      'https://dweb.link/ipfs',
    ];

    this.pinataJwt = process.env.PINATA_JWT;
    this.pinataApiKey = process.env.PINATA_API_KEY;
    this.pinataSecretKey = process.env.PINATA_SECRET_API_KEY;
    this.ipfsApiUrl = process.env.IPFS_API_URL;

    this.ipfsStorageDir = path.resolve(process.cwd(), '.evidence_vault', 'ipfs');
    if (!fs.existsSync(this.ipfsStorageDir)) {
      fs.mkdirSync(this.ipfsStorageDir, { recursive: true });
    }

    this.ipfsRegistryPath = path.join(this.ipfsStorageDir, 'registry.json');
    this.loadRegistry();
  }

  public static getInstance(): IpfsStorageService {
    if (!IpfsStorageService.instance) {
      IpfsStorageService.instance = new IpfsStorageService();
    }
    return IpfsStorageService.instance;
  }

  private loadRegistry(): void {
    try {
      if (fs.existsSync(this.ipfsRegistryPath)) {
        const raw = fs.readFileSync(this.ipfsRegistryPath, 'utf8');
        const list = JSON.parse(raw);
        for (const item of list) {
          this.pinnedRegistry.set(item.cid, item);
        }
      }
    } catch {
      // Clean slate on fresh initialization
    }
  }

  private saveRegistry(): void {
    try {
      const list = Array.from(this.pinnedRegistry.values());
      fs.writeFileSync(this.ipfsRegistryPath, JSON.stringify(list, null, 2), 'utf8');
    } catch {
      // Best-effort local persistence
    }
  }

  // ---------------------------------------------------------------------------
  // CID Computing & Content Addressing
  // ---------------------------------------------------------------------------

  /**
   * Base58 encode a Buffer (used for standard CIDv0)
   */
  public static base58Encode(buffer: Buffer): string {
    const digits = [0];
    for (let i = 0; i < buffer.length; i++) {
      for (let j = 0; j < digits.length; j++) digits[j] <<= 8;
      digits[0] += buffer[i];
      let carry = 0;
      for (let j = 0; j < digits.length; j++) {
        digits[j] += carry;
        carry = (digits[j] / 58) | 0;
        digits[j] %= 58;
      }
      while (carry) {
        digits.push(carry % 58);
        carry = (carry / 58) | 0;
      }
    }
    for (let i = 0; i < buffer.length && buffer[i] === 0; i++) digits.push(0);
    return digits.reverse().map((d) => BASE58_ALPHABET[d]).join('');
  }

  /**
   * Base32 encode a Buffer (RFC 4648 lowercase, used for CIDv1)
   */
  public static base32Encode(buffer: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = '';
    for (let i = 0; i < buffer.length; i++) {
      value = (value << 8) | buffer[i];
      bits += 8;
      while (bits >= 5) {
        output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) {
      output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }
    return output;
  }

  /**
   * Computes standard IPFS CIDv0 (Qm... formatted 32-byte SHA-256 multihash)
   */
  public static computeCidV0(buffer: Buffer): string {
    const sha = crypto.createHash('sha256').update(buffer).digest();
    // 0x12 = sha256 multicodec, 0x20 = 32 bytes length
    const multihash = Buffer.concat([Buffer.from([0x12, 0x20]), sha]);
    return IpfsStorageService.base58Encode(multihash);
  }

  /**
   * Computes canonical IPFS CIDv1 (bafkrei... formatted raw SHA-256 multihash in Base32)
   */
  public static computeCidV1(buffer: Buffer): string {
    const sha = crypto.createHash('sha256').update(buffer).digest();
    // 0x01 = CIDv1, 0x55 = raw multicodec, 0x12 = sha256 multihash, 0x20 = 32 bytes
    const multihash = Buffer.concat([Buffer.from([0x01, 0x55, 0x12, 0x20]), sha]);
    return 'b' + IpfsStorageService.base32Encode(multihash);
  }

  /**
   * Primary CID computation (defaults to CIDv1 bafkrei...)
   */
  public computeCid(buffer: Buffer, version: 'v0' | 'v1' = 'v1'): string {
    return version === 'v0'
      ? IpfsStorageService.computeCidV0(buffer)
      : IpfsStorageService.computeCidV1(buffer);
  }

  /**
   * Validates whether a given string is a valid IPFS CIDv0 or CIDv1 format
   */
  public isValidCid(cid: string): boolean {
    if (!cid || typeof cid !== 'string') return false;

    // CIDv0: starts with Qm, 46 characters, Base58
    if (cid.startsWith('Qm') && cid.length === 46) {
      return /^[1-9A-HJ-NP-Za-km-z]+$/.test(cid);
    }

    // CIDv1: starts with bafy or bafk, Base32
    if ((cid.startsWith('bafy') || cid.startsWith('bafk')) && cid.length >= 48) {
      return /^b[a-z2-7]+$/.test(cid);
    }

    return false;
  }

  /**
   * Verifies downloaded or stored content integrity against its claimed CID
   */
  public verifyContentIntegrity(buffer: Buffer, expectedCid: string): boolean {
    if (!this.isValidCid(expectedCid)) return false;

    if (expectedCid.startsWith('Qm')) {
      const computedV0 = IpfsStorageService.computeCidV0(buffer);
      return computedV0 === expectedCid;
    }

    const computedV1 = IpfsStorageService.computeCidV1(buffer);
    return computedV1.toLowerCase() === expectedCid.toLowerCase();
  }

  // ---------------------------------------------------------------------------
  // Upload and Pinning
  // ---------------------------------------------------------------------------

  /**
   * Uploads file buffer to IPFS, pins the content, and records content metadata
   */
  public async uploadFile(options: {
    buffer: Buffer;
    filename: string;
    mimeType: string;
    isPublic?: boolean;
  }): Promise<IpfsUploadResult> {
    const { buffer, filename, mimeType } = options;

    if (buffer.length === 0) {
      const err: any = new Error('Cannot upload empty file to IPFS.');
      err.statusCode = 400;
      err.code = 'EMPTY_FILE';
      throw err;
    }

    if (buffer.length > MAX_FILE_SIZE) {
      const err: any = new Error(`File size ${buffer.length} bytes exceeds maximum IPFS upload limit of 10 MB.`);
      err.statusCode = 413;
      err.code = 'PAYLOAD_TOO_LARGE';
      throw err;
    }

    const cidV1 = IpfsStorageService.computeCidV1(buffer);
    const cidV0 = IpfsStorageService.computeCidV0(buffer);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const now = new Date().toISOString();

    // 1. Content-addressed local pinning (always performed for persistent offline availability)
    const localCidPath = path.join(this.ipfsStorageDir, cidV1);
    fs.writeFileSync(localCidPath, buffer);

    let pinnedRemotely = false;
    let pinService = 'local_content_addressed_vault';

    // 2. Remote pinning to Pinata if configured
    if (this.pinataJwt || (this.pinataApiKey && this.pinataSecretKey)) {
      try {
        pinnedRemotely = await this.pinToPinata(buffer, filename, cidV1);
        if (pinnedRemotely) {
          pinService = 'pinata_cloud';
        }
      } catch (pinErr: any) {
        console.warn(`[IPFS Pinata] Pinning note: ${pinErr.message} (retaining local vault persistence)`);
      }
    }

    // 3. Register in local metadata store
    this.pinnedRegistry.set(cidV1, {
      cid: cidV1,
      filename,
      sizeBytes: buffer.length,
      mimeType,
      sha256,
      pinnedAt: now,
    });
    this.saveRegistry();

    const gatewayUrl = this.getGatewayUrl(cidV1, filename);

    return {
      cid: cidV1,
      cidV0,
      sizeBytes: buffer.length,
      sha256,
      mimeType,
      gatewayUrl,
      pinned: true,
      pinService,
      timestamp: now,
    };
  }

  /**
   * Uploads structured JSON document to IPFS (e.g. Audit Packages, Campaign Metadata, Batch Manifests)
   */
  public async uploadJson(data: any, name: string = 'document.json'): Promise<IpfsUploadResult> {
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const buffer = Buffer.from(jsonStr, 'utf8');

    return this.uploadFile({
      buffer,
      filename: name.endsWith('.json') ? name : `${name}.json`,
      mimeType: 'application/json',
      isPublic: true,
    });
  }

  /**
   * Pins file buffer to Pinata Cloud via REST API
   */
  private async pinToPinata(buffer: Buffer, filename: string, expectedCid: string): Promise<boolean> {
    try {
      const boundary = `----TrustFabricFormBoundary${Date.now()}`;
      const headers: Record<string, string> = {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      };

      if (this.pinataJwt) {
        headers['Authorization'] = `Bearer ${this.pinataJwt}`;
      } else if (this.pinataApiKey && this.pinataSecretKey) {
        headers['pinata_api_key'] = this.pinataApiKey;
        headers['pinata_secret_api_key'] = this.pinataSecretKey;
      }

      const bodyParts: Buffer[] = [
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
        buffer,
        Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="pinataMetadata"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name: filename, keyvalues: { trustfabric: 'true', expectedCid } })}\r\n`),
        Buffer.from(`--${boundary}--\r\n`),
      ];

      const fullBody = Buffer.concat(bodyParts);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers,
        body: fullBody,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Retrieval & Multi-Gateway Fallback
  // ---------------------------------------------------------------------------

  /**
   * Retrieves raw content by CID with local vault caching, gateway fallback, and integrity verification
   */
  public async fetchFile(cid: string): Promise<Buffer> {
    if (!this.isValidCid(cid)) {
      throw new Error(`Invalid IPFS CID: ${cid}`);
    }

    // 1. Check local pinned vault first (fastest and deterministic)
    const localPath = path.join(this.ipfsStorageDir, cid);
    if (fs.existsSync(localPath)) {
      const bytes = fs.readFileSync(localPath);
      if (this.verifyContentIntegrity(bytes, cid)) {
        return bytes;
      }
    }

    // 2. Fetch from IPFS Gateways in order of precedence
    const gatewaysToTry = [this.primaryGateway, ...this.fallbackGateways];
    let lastError: Error | null = null;

    for (const gw of gatewaysToTry) {
      try {
        const cleanGw = gw.replace(/\/+$/, '');
        const targetUrl = `${cleanGw}/${cid}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s per gateway

        const res = await fetch(targetUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const arrayBuf = await res.arrayBuffer();
          const bytes = Buffer.from(arrayBuf);

          // Verify cryptographic content integrity against CID
          if (this.verifyContentIntegrity(bytes, cid)) {
            // Cache locally in vault
            fs.writeFileSync(localPath, bytes);
            return bytes;
          } else {
            throw new Error(`CID integrity verification failed for gateway ${cleanGw}`);
          }
        }
      } catch (fetchErr: any) {
        lastError = fetchErr;
        // Continue to fallback gateway
      }
    }

    throw new Error(
      `Failed to retrieve CID ${cid} from IPFS network: ${lastError?.message || 'All gateways timed out or unavailable'}`
    );
  }

  /**
   * Fetches and parses a JSON document from IPFS
   */
  public async fetchJson<T = any>(cid: string): Promise<T> {
    const bytes = await this.fetchFile(cid);
    return JSON.parse(bytes.toString('utf8'));
  }

  /**
   * Resolves a public gateway URL for a given CID
   */
  public getGatewayUrl(cid: string, filename?: string): string {
    const cleanGw = this.primaryGateway.replace(/\/+$/, '');
    const base = `${cleanGw}/${cid}`;
    return filename ? `${base}?filename=${encodeURIComponent(filename)}` : base;
  }

  /**
   * Checks if a CID is pinned locally
   */
  public isPinned(cid: string): boolean {
    return this.pinnedRegistry.has(cid) || fs.existsSync(path.join(this.ipfsStorageDir, cid));
  }

  /**
   * Returns IPFS subsystem status & configuration
   */
  public getStatus(): IpfsStatus {
    let totalBytesStored = 0;
    try {
      const files = fs.readdirSync(this.ipfsStorageDir);
      for (const f of files) {
        if (f !== 'registry.json') {
          const st = fs.statSync(path.join(this.ipfsStorageDir, f));
          totalBytesStored += st.size;
        }
      }
    } catch {
      // Empty vault
    }

    const hasPinata = Boolean(this.pinataJwt || (this.pinataApiKey && this.pinataSecretKey));

    return {
      enabled: true,
      configured: true,
      provider: hasPinata ? 'pinata' : 'local_content_addressed_vault',
      primaryGateway: this.primaryGateway,
      fallbackGateways: this.fallbackGateways,
      pinnedItemsCount: this.pinnedRegistry.size,
      totalBytesStored,
      supportedCidVersions: ['v0', 'v1'],
      maxUploadSizeBytes: MAX_FILE_SIZE,
    };
  }
}
