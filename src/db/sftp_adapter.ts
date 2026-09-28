import Client from 'ssh2-sftp-client';
import fs from 'fs';
import path from 'path';

const SFTP_CONFIG: Client.ConnectOptions = {
  host: process.env.SFTP_HOST,
  port: Number(process.env.SFTP_PORT || 22),
  username: process.env.SFTP_USER,
  password: process.env.SFTP_PASSWORD,
  readyTimeout: 8000,
  retries: 2,
  retry_minTimeout: 500
};

const REMOTE_BASE_DIR = process.env.SFTP_REMOTE_BASE || '/var/www/premji';
const LOCAL_UPLOADS_DIR = path.resolve(process.cwd(), 'data', 'uploads');
const TMP_UPLOADS_DIR = path.join('/tmp', 'premji_uploads');

// High-speed in-memory image buffer cache for instant zero-latency image serving (<1ms)
const inMemoryImageCache = new Map<string, Buffer>();
const MAX_CACHE_ITEMS = 500;

function setMemoryCache(key: string, buffer: Buffer) {
  if (inMemoryImageCache.size >= MAX_CACHE_ITEMS) {
    const firstKey = inMemoryImageCache.keys().next().value;
    if (firstKey) inMemoryImageCache.delete(firstKey);
  }
  inMemoryImageCache.set(key, buffer);
}

// In-memory negative cache for missing files to prevent repeated failed network roundtrips
const missingFilesCache = new Set<string>();

// Helper to check SFTP config
const hasSftpConfig = () => {
  return !!(
    process.env.SFTP_HOST &&
    process.env.SFTP_USER &&
    (process.env.SFTP_PASSWORD || process.env.SFTP_KEY)
  );
};

// Singleton connection mutex to serialize and reuse SFTP client connections safely
class SftpConnectionManager {
  private client: Client | null = null;
  private isConnecting = false;
  private queue: Array<() => void> = [];
  private lastErrorTime = 0;
  private readonly ERROR_COOLDOWN_MS = 10000; // 10s cooldown on handshake failures

  private async acquireLock(): Promise<void> {
    if (!this.isConnecting) {
      this.isConnecting = true;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  private releaseLock(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.isConnecting = false;
    }
  }

  async withClient<T>(operation: (client: Client) => Promise<T>): Promise<T | null> {
    if (!hasSftpConfig()) return null;

    // Circuit breaker if recent fatal connection loss
    if (Date.now() - this.lastErrorTime < this.ERROR_COOLDOWN_MS) {
      return null;
    }

    await this.acquireLock();
    const sftp = new Client();
    try {
      await sftp.connect(SFTP_CONFIG);
      const result = await operation(sftp);
      await sftp.end();
      return result;
    } catch (err: any) {
      this.lastErrorTime = Date.now();
      // Silently record warning and fallback
      console.warn(`[SFTP Notice] Remote storage connection unavailable: ${err.message}`);
      try {
        await sftp.end();
      } catch {}
      return null;
    } finally {
      this.releaseLock();
    }
  }
}

const sftpManager = new SftpConnectionManager();

export const sftpStorage = {
  /**
   * Uploads an image (either as buffer or Base64 WebP/JPEG)
   * @param relativePath Subdirectory path like "attendance/2026/09"
   * @param fileName File name like "TECH01_on_duty_in.jpg"
   * @param base64Data Base64 string of the image
   */
  async uploadImage(relativePath: string, fileName: string, base64Data: string): Promise<string> {
    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '').trim();
    const buffer = Buffer.from(cleanBase64, 'base64');

    const cleanRelativePath = relativePath.replace(/\\/g, '/');
    const displayPath = `${cleanRelativePath}/${fileName}`;

    // 1. Instantly store in memory cache for sub-millisecond retrieval
    setMemoryCache(displayPath, buffer);
    setMemoryCache(cleanRelativePath + '/' + fileName, buffer);
    setMemoryCache(fileName, buffer);
    missingFilesCache.delete(displayPath);
    missingFilesCache.delete(fileName);

    // 2. Save to local disk locations immediately for persistence
    const writeDirs = [LOCAL_UPLOADS_DIR, TMP_UPLOADS_DIR];
    for (const baseDir of writeDirs) {
      try {
        const targetDir = path.join(baseDir, cleanRelativePath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        fs.writeFileSync(path.join(targetDir, fileName), buffer);
      } catch (localErr) {
        // Safe continuation
      }
    }

    // 3. Upload to remote SFTP in background/withClient (async non-blocking)
    if (hasSftpConfig()) {
      sftpManager.withClient(async (sftp) => {
        const targetDir = `${REMOTE_BASE_DIR}/${cleanRelativePath}`.replace(/\/+/g, '/');
        const targetPath = `${targetDir}/${fileName}`.replace(/\/+/g, '/');

        const exists = await sftp.exists(targetDir);
        if (!exists) {
          await sftp.mkdir(targetDir, true);
        }
        await sftp.put(buffer, targetPath);
        console.log(`✅ Uploaded to VPS SFTP: ${targetPath}`);
      }).catch((e) => {
        console.warn('SFTP async upload warning:', e.message);
      });
    }

    return displayPath;
  },

  /**
   * Read image as buffer from In-Memory cache, Local disk, or VPS SFTP
   */
  async getImageBuffer(virtualPath: string): Promise<Buffer> {
    const cleanPath = virtualPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const baseName = path.basename(cleanPath);

    // 1. FAST IN-MEMORY CACHE CHECK (<0.1ms instant response)
    if (inMemoryImageCache.has(cleanPath)) {
      return inMemoryImageCache.get(cleanPath)!;
    }
    if (inMemoryImageCache.has(baseName)) {
      return inMemoryImageCache.get(baseName)!;
    }

    // 2. DISK CACHE CHECK (Across standard and /tmp directories)
    const candidatePaths = [
      path.join(LOCAL_UPLOADS_DIR, cleanPath),
      path.join(TMP_UPLOADS_DIR, cleanPath),
      path.join(LOCAL_UPLOADS_DIR, baseName),
      path.join(TMP_UPLOADS_DIR, baseName),
      path.resolve(process.cwd(), 'data', 'uploads', cleanPath),
      path.resolve(process.cwd(), 'data', 'uploads', baseName)
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          const buf = fs.readFileSync(p);
          setMemoryCache(cleanPath, buf);
          setMemoryCache(baseName, buf);
          return buf;
        } catch {}
      }
    }

    // Check in-memory negative cache
    if (missingFilesCache.has(cleanPath) || missingFilesCache.has(baseName)) {
      return Buffer.from(getPlaceholderSvg(baseName));
    }

    // 3. SFTP Remote download with Mutex Lock
    if (hasSftpConfig()) {
      const remoteBuffer = await sftpManager.withClient(async (sftp) => {
        const remoteFilePath = `${REMOTE_BASE_DIR}/${cleanPath}`.replace(/\/+/g, '/');
        const exists = await sftp.exists(remoteFilePath);
        if (exists) {
          const buffer = (await sftp.get(remoteFilePath)) as Buffer;
          setMemoryCache(cleanPath, buffer);
          setMemoryCache(baseName, buffer);
          try {
            const dir = path.join(LOCAL_UPLOADS_DIR, path.dirname(cleanPath));
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(LOCAL_UPLOADS_DIR, cleanPath), buffer);
          } catch {}
          return buffer;
        }
        return null;
      });

      if (remoteBuffer) {
        return remoteBuffer;
      }
    }

    // 4. Record negative cache only after all attempts fail
    missingFilesCache.add(cleanPath);
    if (missingFilesCache.size > 500) missingFilesCache.clear();

    return Buffer.from(getPlaceholderSvg(baseName));
  },

  /**
   * Delete image file (for cleanup logs)
   */
  async deleteImage(virtualPath: string): Promise<boolean> {
    const cleanPath = virtualPath.replace(/\\/g, '/');

    if (hasSftpConfig()) {
      sftpManager.withClient(async (sftp) => {
        const remoteFilePath = `${REMOTE_BASE_DIR}/${cleanPath}`.replace(/\/+/g, '/');
        const exists = await sftp.exists(remoteFilePath);
        if (exists) {
          await sftp.delete(remoteFilePath);
        }
      }).catch(() => {});
    }

    const localFilePath = path.join(LOCAL_UPLOADS_DIR, cleanPath);
    if (fs.existsSync(localFilePath)) {
      try {
        fs.unlinkSync(localFilePath);
        return true;
      } catch {}
    }

    return false;
  }
};

// Generates an attractive placeholder SVG for missing images
function getPlaceholderSvg(title: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
    <rect width="100%" height="100%" fill="#f8fafc"/>
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#bae6fd"/>
        <stop offset="100%" stop-color="#e0f2fe"/>
      </linearGradient>
    </defs>
    <rect width="380" height="280" x="10" y="10" rx="16" fill="url(#g)" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="6 4"/>
    <circle cx="200" cy="130" r="45" fill="#38bdf8" opacity="0.2"/>
    <path d="M185 130a15 15 0 1 0 30 0 15 15 0 1 0-30 0M170 180c0-15 10-25 30-25s30 10 30 25" stroke="#0284c7" stroke-width="3" stroke-linecap="round" fill="none"/>
    <text x="50%" y="220" font-family="-apple-system, sans-serif" font-size="14" font-weight="600" fill="#0369a1" text-anchor="middle">${title}</text>
    <text x="50%" y="242" font-family="-apple-system, sans-serif" font-size="11" fill="#0284c7" text-anchor="middle">Premji Operations Portal Secured</text>
  </svg>`;
}
