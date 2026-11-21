import type { BranchConnection } from './storage';

/** Panggilan ke /api/kasir/connect (dashboard). Lihat admin-dashboard/src/app/api/kasir/connect/route.ts */

export interface OwnerBranch {
  id: string;
  name: string;
  address: string | null;
}

/** Alamat endpoint connect, diturunkan dari URL sync (custom) atau domain yang sama. */
export function connectEndpoint(syncApiUrl?: string): string {
  const custom = syncApiUrl?.trim().replace(/\/+$/, '');
  if (custom) {
    return /\/api\/sync$/.test(custom) ? custom.replace(/\/api\/sync$/, '/api/kasir/connect') : `${custom}/api/kasir/connect`;
  }
  if (typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)) {
    return `${window.location.origin}/api/kasir/connect`;
  }
  return '/api/kasir/connect';
}

async function call<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  } catch {
    throw new Error('Tidak dapat terhubung ke server. Periksa koneksi internet.');
  }
  const body = (await res.json().catch(() => null)) as (T & { success?: boolean; error?: string }) | null;
  if (!res.ok || !body || body.success === false) {
    throw new Error(body?.error || `Server menolak permintaan (HTTP ${res.status}).`);
  }
  return body;
}

export async function loginOwner(email: string, password: string, syncApiUrl?: string): Promise<{ accessToken: string; branches: OwnerBranch[] }> {
  const body = await call<{ accessToken: string; branches: OwnerBranch[] }>(connectEndpoint(syncApiUrl), {
    method: 'POST',
    body: JSON.stringify({ action: 'login', email: email.trim(), password }),
  });
  if (typeof body.accessToken !== 'string' || !Array.isArray(body.branches)) throw new Error('Respons server tidak valid.');
  return { accessToken: body.accessToken, branches: body.branches };
}

export async function selectBranch(accessToken: string, businessId: string, syncApiUrl?: string): Promise<BranchConnection> {
  const body = await call<BranchConnection>(connectEndpoint(syncApiUrl), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ action: 'select', businessId }),
  });
  if (typeof body.token !== 'string' || !body.branch?.id) throw new Error('Respons server tidak valid.');
  return { token: body.token, branch: body.branch, hasConfig: !!body.hasConfig };
}

export async function verifyToken(token: string, syncApiUrl?: string): Promise<BranchConnection> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Tempel token cabang terlebih dahulu.');
  const body = await call<Omit<BranchConnection, 'token'>>(connectEndpoint(syncApiUrl), {
    method: 'GET',
    headers: { Authorization: `Bearer ${trimmed}` },
  });
  if (!body.branch?.id) throw new Error('Respons server tidak valid.');
  return { token: trimmed, branch: body.branch, hasConfig: !!body.hasConfig };
}

/** URL halaman web untuk login Google lalu kembali ke kasir dengan token cabang. */
export function googleConnectUrl(syncApiUrl?: string): string {
  return connectEndpoint(syncApiUrl).replace(/\/api\/kasir\/connect$/, '/login?next=/kasir-connect');
}
