import React, { useState, useEffect } from 'react';
import {
  getActiveCashier,
  getActiveShift,
  getStoreSettings,
  hasPendingPush,
  initLocalStorage,
  maybeAutoSync,
  POS_UPDATE_EVENT,
} from './lib/storage';
import { can, Permission } from './lib/permissions';
import { Cashier, Shift, StoreSettings, CartItem } from './types';
import { Navbar } from './components/Navbar';
import { POSScreen } from './components/POS/POSScreen';
import { TransactionsHistory } from './components/TransactionsHistory';
import { MenuManagement } from './components/MenuManagement';
import { CashierManagement } from './components/CashierManagement';
import { ReportsScreen } from './components/ReportsScreen';
import { ExpensesScreen } from './components/ExpensesScreen';
import { SettingsModal } from './components/SettingsModal';
import { CashierSwitchModal } from './components/CashierSwitchModal';

export type AppTab = 'pos' | 'history' | 'expenses' | 'menu' | 'cashiers' | 'reports' | 'settings';

export const TAB_PERMISSION: Record<AppTab, Permission> = {
  pos: 'pos',
  history: 'history',
  expenses: 'expenses',
  menu: 'menu',
  cashiers: 'cashiers',
  reports: 'reports',
  settings: 'settings',
};

/** Tarik perubahan dari perangkat lain secara berkala selama aplikasi terbuka & online. */
const PULL_INTERVAL_MS = 30 * 1000;
/** Jeda singkat setelah perubahan, agar beberapa perubahan beruntun terkirim sekaligus. */
const PUSH_DEBOUNCE_MS = 800;

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('pos');

  const [activeCashier, setActiveCashierState] = useState<Cashier>(() => getActiveCashier());
  const [activeShift, setActiveShiftState] = useState<Shift | null>(() => getActiveShift());
  const [storeSettings, setStoreSettingsState] = useState<StoreSettings>(() => getStoreSettings());
  const [cart, setCart] = useState<CartItem[]>([]);
  /** Draf yang sedang dibuka di keranjang; disimpan di sini agar tidak hilang saat pindah tab */
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [isCashierModalOpen, setIsCashierModalOpen] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Sync state on updates or localStorage changes
  const syncStorage = () => {
    setActiveCashierState(getActiveCashier());
    setActiveShiftState(getActiveShift());
    setStoreSettingsState(getStoreSettings());
  };

  useEffect(() => {
    initLocalStorage();
    syncStorage();

    // Kirim segera setelah ada perubahan (dengan jeda singkat agar satu aksi = satu request)
    let syncTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleSync = (pull = false) => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => maybeAutoSync({ pull }), pull ? 0 : PUSH_DEBOUNCE_MS);
    };

    const handlePosUpdate = () => {
      syncStorage();
      // Hanya perubahan lokal yang perlu dikirim; data hasil tarikan tidak memicu sync lagi.
      if (hasPendingPush()) scheduleSync();
    };

    const handleOnlineStatus = () => {
      setIsOnline(navigator.onLine);
      if (navigator.onLine) scheduleSync(true);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') scheduleSync(true);
    };

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') maybeAutoSync({ pull: true });
    }, PULL_INTERVAL_MS);
    scheduleSync(true);

    window.addEventListener(POS_UPDATE_EVENT, handlePosUpdate);
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimeout(syncTimer);
      clearInterval(interval);
      window.removeEventListener(POS_UPDATE_EVENT, handlePosUpdate);
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Kembali ke POS jika kasir yang aktif tidak punya akses ke tab saat ini
  const canAccessTab = can(activeCashier.role, TAB_PERMISSION[activeTab]);
  useEffect(() => {
    if (!canAccessTab) setActiveTab('pos');
  }, [canAccessTab]);

  return (
    <div
      className={`min-h-screen bg-[#F4F1EE] text-[#2C2420] font-sans flex flex-col selection:bg-[#3E2723] selection:text-white ${
        activeTab === 'pos' ? 'lg:h-screen lg:overflow-hidden' : ''
      }`}
    >
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeCashier={activeCashier}
        activeShift={activeShift}
        storeSettings={storeSettings}
        isOnline={isOnline}
        onOpenCashierModal={() => setIsCashierModalOpen(true)}
        cartItemCount={cart.reduce((sum, item) => sum + item.quantity, 0)}
      />

      {/* View Router */}
      <main
        className={
          activeTab === 'pos'
            ? 'flex-1 min-h-0 flex flex-col pb-6 lg:pb-0 lg:overflow-hidden'
            : 'flex-1 pb-8'
        }
      >
        {activeTab === 'pos' && (
          <POSScreen
            activeCashier={activeCashier}
            activeShift={activeShift}
            onOpenShiftModal={() => setIsCashierModalOpen(true)}
            storeSettings={storeSettings}
            cart={cart}
            setCart={setCart}
            activeDraftId={activeDraftId}
            setActiveDraftId={setActiveDraftId}
          />
        )}

        {activeTab === 'history' && (
          <TransactionsHistory storeSettings={storeSettings} activeCashier={activeCashier} />
        )}

        {activeTab === 'expenses' && canAccessTab && (
          <ExpensesScreen activeCashier={activeCashier} activeShift={activeShift} />
        )}

        {activeTab === 'menu' && canAccessTab && <MenuManagement />}

        {activeTab === 'cashiers' && canAccessTab && (
          <CashierManagement
            activeCashier={activeCashier}
            onOpenShiftModal={() => setIsCashierModalOpen(true)}
          />
        )}

        {activeTab === 'reports' && canAccessTab && <ReportsScreen activeCashier={activeCashier} />}

        {activeTab === 'settings' && canAccessTab && (
          <SettingsModal
            onSettingsUpdated={(updatedSettings) => setStoreSettingsState(updatedSettings)}
          />
        )}
      </main>

      {/* Cashier & Shift Switcher Modal */}
      {isCashierModalOpen && (
        <CashierSwitchModal
          activeCashier={activeCashier}
          activeShift={activeShift}
          onClose={() => setIsCashierModalOpen(false)}
          onCashierChanged={(cashier) => {
            setActiveCashierState(cashier);
            setActiveShiftState(getActiveShift());
          }}
        />
      )}
    </div>
  );
}
