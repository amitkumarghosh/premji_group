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
const LOCAL_UPLOADS_DIR = process.env.VERCEL
  ? path.join('/tmp', 'premji_uploads')
  : path.resolve(process.cwd(), 'data', 'uploads');

// In-memory negative cache for missing files to prevent repeated failed network roundtrips
const missingFilesCache = new Set<string>();

// Ensure local uploads folder exists safely
try {
  if (!fs.existsSync(LOCAL_UPLOADS_DIR)) {
    fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });
  }
} catch (e) {
  // Gracefully continue on read-only environments
}

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
   * Uploads an image (either as buffer or Base64 WebP)
   * @param relativePath Subdirectory path like "attendance/2026/09"
   * @param fileName File name like "TECH01_on_duty_in.webp"
   * @param base64Data Base64 string of the image
   */
  async uploadImage(relativePath: string, fileName: string, base64Data: string): Promise<string> {
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const cleanRelativePath = relativePath.replace(/\\/g, '/');
    const displayPath = `${cleanRelativePath}/${fileName}`;

    // 1. Save to local disk immediately for instant reliability & cache
    try {
      const targetLocalDir = path.join(LOCAL_UPLOADS_DIR, cleanRelativePath);
      if (!fs.existsSync(targetLocalDir)) {
        fs.mkdirSync(targetLocalDir, { recursive: true });
      }
      const targetLocalPath = path.join(targetLocalDir, fileName);
      fs.writeFileSync(targetLocalPath, buffer);
    } catch (localErr) {
      console.warn('Local disk write warning:', localErr);
    }

    // 2. Upload to remote SFTP in background/withClient
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
   * Read image as buffer from Local disk cache or VPS SFTP
   */
  async getImageBuffer(virtualPath: string): Promise<Buffer> {
    const cleanPath = virtualPath.replace(/\\/g, '/').replace(/^\/+/, '');

    // 1. FAST DISK CACHE CHECK FIRST (Instant sub-millisecond response)
    const localFilePath = path.join(LOCAL_UPLOADS_DIR, cleanPath);
    if (fs.existsSync(localFilePath)) {
      try {
        return fs.readFileSync(localFilePath);
      } catch (readErr) {
        console.warn('Local file read warning, checking SFTP:', readErr);
      }
    }

    // Check in-memory negative cache
    if (missingFilesCache.has(cleanPath)) {
      const filename = path.basename(cleanPath);
      return Buffer.from(getPlaceholderSvg(filename));
    }

    // 2. SFTP Remote download with Mutex Lock
    if (hasSftpConfig()) {
      const remoteBuffer = await sftpManager.withClient(async (sftp) => {
        const remoteFilePath = `${REMOTE_BASE_DIR}/${cleanPath}`.replace(/\/+/g, '/');
        const exists = await sftp.exists(remoteFilePath);
        if (exists) {
          const buffer = (await sftp.get(remoteFilePath)) as Buffer;
          // Cache on local disk for subsequent instant requests
          try {
            const dir = path.dirname(localFilePath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(localFilePath, buffer);
          } catch (writeErr) {
            console.warn('Local disk cache write failed:', writeErr);
          }
          return buffer;
        }
        return null;
      });

      if (remoteBuffer) {
        return remoteBuffer;
      }
    }

    // 3. Negative cache to avoid retrying non-existent files repeatedly
    missingFilesCache.add(cleanPath);
    if (missingFilesCache.size > 500) {
      missingFilesCache.clear();
    }

    // 4. Fallback styled placeholder SVG
    const filename = path.basename(cleanPath);
    return Buffer.from(getPlaceholderSvg(filename));
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
