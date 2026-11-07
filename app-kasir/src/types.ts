export type CategoryId = 'all' | 'kopi' | 'non-kopi' | 'makanan' | 'camilan' | 'topping' | string;

export interface ProductOption {
  name: string; // e.g. "Suhu" or "Gula"
  choices: { label: string; extraPrice: number }[];
}

export interface Product {
  id: string;
  name: string;
  categoryId: CategoryId;
  price: number;
  costPrice?: number; // Modal
  stock: number; // -1 for unlimited
  isAvailable: boolean;
  imageUrl?: string;
  colorBg?: string;
  options?: ProductOption[];
  description?: string;
}

export interface SelectedOption {
  groupName: string;
  choiceLabel: string;
  extraPrice: number;
}

export interface CartItem {
  cartItemId: string; // unique ID in cart
  product: Product;
  quantity: number;
  selectedOptions: SelectedOption[];
  notes?: string;
  unitPrice: number; // base price + selected options extra price
  totalPrice: number; // unitPrice * quantity
}

export type PaymentType = 'tunai' | 'qris' | 'transfer' | 'ewallet' | 'hutang' | 'debit';

export type CashierRole = 'Kasir' | 'Supervisor' | 'Owner';

export interface Cashier {
  id: string;
  name: string;
  role: CashierRole;
  /** @deprecated plaintext PIN dari versi lama; dimigrasi ke pinHash saat startup */
  pin?: string;
  pinHash?: string;
  pinSalt?: string;
  avatarColor?: string;
  isActive?: boolean;
}

export interface Shift {
  id: string;
  cashierId: string;
  cashierName: string;
  startTime: string;
  endTime?: string;
  startingCash: number;
  endingCashActual?: number;
  totalSalesCash: number;
  totalSalesNonCash: number;
  /** Penjualan bon/hutang (belum ada uang masuk) */
  totalSalesDebt?: number;
  /** Pelunasan bon yang diterima tunai selama shift ini */
  debtCollectedCash?: number;
  /** Pelunasan bon yang diterima non-tunai selama shift ini */
  debtCollectedNonCash?: number;
  totalTransactions: number;
  /** Pengeluaran harian yang diambil dari laci selama shift ini */
  expensesCash?: number;
  /** Diisi saat tutup shift: modal + tunai masuk - pengeluaran dari laci */
  expectedCash?: number;
  status: 'open' | 'closed';
}

export interface Transaction {
  id: string; // e.g. WKP-20260729-0001
  timestamp: string; // ISO string
  cashierId: string;
  cashierName: string;
  orderType: 'Dine In' | 'Takeaway' | 'Online / Ojol';
  customerName?: string;
  customerPhone?: string;
  items: CartItem[];
  subtotal: number;
  discountAmount: number;
  discountReason?: string;
  taxAmount: number;
  grandTotal: number;
  paymentType: PaymentType;
  paymentDetail?: string; // e.g. "BCA", "GoPay", "QRIS Statis"
  amountPaid: number;
  changeAmount: number;
  status: 'completed' | 'cancelled';
  shiftId?: string;
  cancelReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  /** Hanya untuk paymentType 'hutang' */
  debtStatus?: 'unpaid' | 'paid';
  debtPaidAt?: string;
  debtPaidMethod?: 'tunai' | 'nontunai';
  debtPaidShiftId?: string;
  notes?: string;
  isSynced?: boolean;
  syncedAt?: string;
}

export type ExpenseScope = 'daily' | 'monthly';

export interface Expense {
  id: string;
  /** daily: pengeluaran operasional hari itu; monthly: biaya tetap/global satu bulan */
  scope: ExpenseScope;
  /** YYYY-MM-DD untuk harian, YYYY-MM untuk bulanan */
  date: string;
  category: string;
  amount: number;
  note?: string;
  /** Uang diambil dari laci kas shift (hanya harian) */
  fromDrawer?: boolean;
  shiftId?: string;
  createdBy: string;
  createdAt: string;
  isSynced?: boolean;
  syncedAt?: string;
}

export interface StoreSettings {
  storeName: string;
  storeTagline: string;
  address: string;
  phone: string;
  receiptHeaderMsg: string;
  receiptFooterMsg: string;
  taxRatePercent: number; // e.g. 0 or 10
  enableTax: boolean;
  qrisMerchantName: string;
  qrisNmid?: string;
  bankAccounts: { bankName: string; accountNumber: string; accountHolder: string }[];
  eWallets: { provider: string; phoneNumber: string; accountHolder: string }[];
  // Sync to PostgreSQL Website API Configuration
  syncApiUrl?: string;
  syncApiKey?: string;
  autoSyncOnline?: boolean;
  lastSyncedAt?: string;
  lastSyncError?: string;
  // Printer struk
  printerMethod?: 'serial' | 'bluetooth' | 'rawbt' | 'browser';
  printerPaperWidth?: 58 | 80;
  autoPrintAfterPayment?: boolean;
  /** Baris kosong setelah struk (agar bisa disobek). Default: 0 untuk RawBT, 2 untuk lainnya. */
  printerFeedLines?: number;
  /** Struk ringkas hemat kertas (default true) */
  receiptCompact?: boolean;
}

export interface Category {
  id: CategoryId;
  name: string;
  iconName: string;
}
