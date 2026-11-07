import React, { useState, useEffect } from 'react';
import {
  getActiveCashier,
  getActiveShift,
  getStoreSettings,
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

const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('pos');

  const [activeCashier, setActiveCashierState] = useState<Cashier>(() => getActiveCashier());
  const [activeShift, setActiveShiftState] = useState<Shift | null>(() => getActiveShift());
  const [storeSettings, setStoreSettingsState] = useState<StoreSettings>(() => getStoreSettings());
  const [cart, setCart] = useState<CartItem[]>([]);
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

    // Debounce auto-sync agar tidak terpicu berkali-kali untuk satu aksi
    let syncTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleAutoSync = () => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(maybeAutoSync, 3000);
    };

    const handlePosUpdate = () => {
      syncStorage();
      scheduleAutoSync();
    };

    const handleOnlineStatus = () => {
      setIsOnline(navigator.onLine);
      if (navigator.onLine) scheduleAutoSync();
    };

    const interval = setInterval(maybeAutoSync, AUTO_SYNC_INTERVAL_MS);
    scheduleAutoSync();

    window.addEventListener(POS_UPDATE_EVENT, handlePosUpdate);
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);

    return () => {
      clearTimeout(syncTimer);
      clearInterval(interval);
      window.removeEventListener(POS_UPDATE_EVENT, handlePosUpdate);
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
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
