import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'premji_groups_portal_super_secure_salt_2026';

function base64UrlEncode(str: string | Buffer): string {
  const base64 = typeof str === 'string' ? Buffer.from(str).toString('base64') : str.toString('base64');
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

export interface JwtPayload {
  employee_code: string;
  employee_name: string;
  user_role: 'Technician' | 'Accounts' | 'Engineer' | 'TeamLeader' | 'Admin' | 'Super Admin';
  center_code: string | null;
  center_name: string | null;
  exp: number;
}

export const jwtUtil = {
  sign(payload: Omit<JwtPayload, 'exp'>, expiresInDays = 7): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const exp = Math.floor(Date.now() / 1000) + expiresInDays * 24 * 60 * 60;
    const fullPayload = { ...payload, exp };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(signatureInput)
      .digest();

    const encodedSignature = base64UrlEncode(signature);
    return `${signatureInput}.${encodedSignature}`;
  },

  verify(token: string): JwtPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const [encodedHeader, encodedPayload, encodedSignature] = parts;
      const signatureInput = `${encodedHeader}.${encodedPayload}`;

      const expectedSignature = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(signatureInput)
        .digest();

      const expectedEncodedSignature = base64UrlEncode(expectedSignature);

      // Secure constant-time comparison
      const match = crypto.timingSafeEqual(
        Buffer.from(encodedSignature),
        Buffer.from(expectedEncodedSignature)
      );

      if (!match) return null;

      const payload: JwtPayload = JSON.parse(base64UrlDecode(encodedPayload));

      // Check expiration
      if (payload.exp && Date.now() / 1000 > payload.exp) {
        return null;
      }

      return payload;
    } catch (err) {
      return null;
    }
  }
};
