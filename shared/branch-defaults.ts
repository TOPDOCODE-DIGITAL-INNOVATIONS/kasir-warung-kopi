/**
 * Data master awal untuk cabang yang belum punya data kasir di server.
 * Dipakai aplikasi kasir (layar Hubungkan/Siapkan Cabang) dan dashboard (Kelola User).
 * Tanpa import agar bisa dipakai di Vite, Next.js, dan test.
 */
export const NEW_BRANCH_CATEGORIES = [
  { id: 'all', name: 'Semua Menu', iconName: 'Coffee' },
  { id: 'minuman', name: 'Minuman', iconName: 'CupSoda' },
  { id: 'makanan', name: 'Makanan', iconName: 'Utensils' },
  { id: 'camilan', name: 'Camilan', iconName: 'Utensils' },
]

export function newBranchSettings(storeName: string) {
  return {
    storeName,
    storeTagline: '',
    address: '',
    phone: '',
    receiptHeaderMsg: 'Terima kasih',
    receiptFooterMsg: '',
    wifiName: '',
    wifiPassword: '',
    taxRatePercent: 0,
    enableTax: false,
    qrisMerchantName: '',
    bankAccounts: [] as { bankName: string; accountNumber: string; accountHolder: string }[],
    eWallets: [] as { provider: string; phoneNumber: string; accountHolder: string }[],
  }
}
