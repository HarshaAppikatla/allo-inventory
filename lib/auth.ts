import { NextRequest, NextResponse } from 'next/server';

const SESSION_SECRET = process.env.SESSION_SECRET || 'allo-inventory-secure-session-secret-key-12345678-very-long-and-secure';
const PBKDF2_ITERATIONS = 10000;

export interface SessionPayload {
  email: string;
  role: string;
  name: string;
  exp: number;
}

/**
 * Hash a password securely using PBKDF2 and SHA-256 via Web Crypto API.
 * Output format: "saltHex:hashHex"
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const passwordKey = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedKey = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    256 // 32 bytes (256 bits)
  );

  const hashHex = Array.from(new Uint8Array(derivedKey))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${saltHex}:${hashHex}`;
}

/**
 * Verify a password matches the stored PBKDF2 hash.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const [saltHex, originalHashHex] = storedHash.split(':');
    if (!saltHex || !originalHashHex) return false;

    // Convert saltHex back to Uint8Array
    const saltBytes = new Uint8Array(
      saltHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    const passwordKey = await globalThis.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const derivedKey = await globalThis.crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      passwordKey,
      256
    );

    const hashHex = Array.from(new Uint8Array(derivedKey))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return hashHex === originalHashHex;
  } catch (err) {
    console.error('[auth] Password verification error:', err);
    return false;
  }
}

/**
 * Sign user details into a lightweight session token string signed with HMAC SHA-256.
 */
export async function signSession(payload: Omit<SessionPayload, 'exp'>): Promise<string> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const dataStr = JSON.stringify({
    ...payload,
    exp: Date.now() + 2 * 60 * 60 * 1000, // 2-hour expiration window
  });

  const encodedPayload = btoa(unescape(encodeURIComponent(dataStr)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  const signatureBuffer = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(encodedPayload)
  );

  const signatureBytes = new Uint8Array(signatureBuffer);
  let signatureBin = '';
  for (let i = 0; i < signatureBytes.length; i++) {
    signatureBin += String.fromCharCode(signatureBytes[i]);
  }

  const signature = btoa(signatureBin)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${encodedPayload}.${signature}`;
}

/**
 * Verify a session token and extract the payload, checking for expiry.
 */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encodedPayload, signature] = parts;

    const enc = new TextEncoder();
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      enc.encode(SESSION_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Decode signature
    let sigBase64 = signature.replace(/-/g, '+').replace(/_/g, '/');
    while (sigBase64.length % 4) sigBase64 += '=';
    const sigStr = atob(sigBase64);
    const sigBytes = new Uint8Array(sigStr.length);
    for (let i = 0; i < sigStr.length; i++) {
      sigBytes[i] = sigStr.charCodeAt(i);
    }

    const isValid = await globalThis.crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      enc.encode(encodedPayload)
    );

    if (!isValid) return null;

    // Decode payload safely supporting unicode
    let payloadBase64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    while (payloadBase64.length % 4) payloadBase64 += '=';
    const payloadStr = decodeURIComponent(escape(atob(payloadBase64)));
    const payload = JSON.parse(payloadStr) as SessionPayload;

    if (payload.exp && Date.now() > payload.exp) {
      return null; // Expired session
    }

    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Server-side helper to authenticate and authorize a Route Handler request based on allowed roles.
 */
export async function authorizeRequest(
  req: NextRequest,
  allowedRoles: string[]
): Promise<{ authorized: boolean; response?: NextResponse; session?: SessionPayload }> {
  try {
    const cookie = req.cookies.get('allo_session')?.value;
    const session = cookie ? await verifySession(cookie) : null;

    if (!session) {
      return {
        authorized: false,
        response: NextResponse.json(
          { success: false, error: 'Authentication required' },
          { status: 401 }
        ),
      };
    }

    if (!allowedRoles.includes(session.role)) {
      return {
        authorized: false,
        response: NextResponse.json(
          { success: false, error: 'Forbidden: Insufficient privileges' },
          { status: 403 }
        ),
      };
    }

    return { authorized: true, session };
  } catch (err) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: 'Authorization processing error' },
        { status: 500 }
      ),
    };
  }
}
