import { CashierRole } from '../types';

export type Permission =
  | 'pos' // transaksi kasir
  | 'history' // lihat riwayat & lunasi bon
  | 'cancelTransaction' // batalkan nota
  | 'menu' // kelola katalog menu & stok
  | 'reports' // lihat laporan
  | 'cashiers' // kelola akun kasir
  | 'settings' // pengaturan toko & sync
  | 'dataAdmin'; // backup, import, reset data

const ROLE_PERMISSIONS: Record<CashierRole, Permission[]> = {
  Kasir: ['pos', 'history'],
  Supervisor: ['pos', 'history', 'cancelTransaction', 'menu', 'reports'],
  Owner: ['pos', 'history', 'cancelTransaction', 'menu', 'reports', 'cashiers', 'settings', 'dataAdmin'],
};

export function can(role: CashierRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export const ROLE_LABELS: Record<CashierRole, string> = {
  Kasir: 'Kasir',
  Supervisor: 'Supervisor / Manager',
  Owner: 'Owner / Pemilik',
};
