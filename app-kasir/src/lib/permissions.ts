import { CashierRole } from '../types';

export type Permission =
  | 'pos' // transaksi kasir
  | 'history' // lihat riwayat & lunasi bon
  | 'cancelTransaction' // batalkan nota
  | 'editTransaction' // koreksi transaksi yang salah catat
  | 'menu' // kelola katalog menu & stok
  | 'reports' // lihat laporan
  | 'expenses' // catat pengeluaran harian
  | 'manageExpenses' // pengeluaran bulanan & hapus pengeluaran
  | 'cashiers' // kelola akun kasir
  | 'settings' // pengaturan toko & sync
  | 'dataAdmin'; // backup, import, reset data

const ROLE_PERMISSIONS: Record<CashierRole, Permission[]> = {
  Kasir: ['pos', 'history', 'expenses'],
  Supervisor: ['pos', 'history', 'expenses', 'manageExpenses', 'cancelTransaction', 'editTransaction', 'menu', 'reports'],
  Owner: ['pos', 'history', 'expenses', 'manageExpenses', 'cancelTransaction', 'editTransaction', 'menu', 'reports', 'cashiers', 'settings', 'dataAdmin'],
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
