import React from 'react';
import {
  Coffee,
  Receipt,
  UtensilsCrossed,
  Users,
  BarChart3,
  Settings,
  Wifi,
  WifiOff,
  UserCheck,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { Cashier, Shift, StoreSettings } from '../types';
import { formatIDR } from '../lib/storage';
import { can } from '../lib/permissions';
import type { AppTab } from '../App';

interface NavbarProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  activeCashier: Cashier;
  activeShift: Shift | null;
  storeSettings: StoreSettings;
  isOnline: boolean;
  onOpenCashierModal: () => void;
  cartItemCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  activeCashier,
  activeShift,
  storeSettings,
  isOnline,
  onOpenCashierModal,
  cartItemCount,
}) => {
  return (
    <header className="bg-[#3E2723] text-white border-b border-[#2C1A17] sticky top-0 z-30 shadow-md">
      {/* Top Banner Bar */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3">
          <div className="bg-[#D7CCC8] text-[#3E2723] p-2 rounded-xl flex items-center justify-center font-bold shadow-sm">
            <Coffee className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="font-bold text-base sm:text-lg tracking-tight text-white flex items-center gap-2 leading-tight">
              <span>{storeSettings.storeName || 'KOPI KITA'}</span>
              <span className="font-light opacity-70 text-xs hidden sm:inline">| POS v2.0</span>
            </h1>
            <p className="text-[11px] text-[#D7CCC8] opacity-80 hidden sm:block">
              {storeSettings.storeTagline || 'Aplikasi Kasir Offline Warung Kopi'}
            </p>
          </div>
        </div>

        {/* Right Info Badges & Cashier Controller */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Offline / Online Status Badge */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
              isOnline
                ? 'bg-white/10 text-white border border-white/20'
                : 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
            }`}
            title={isOnline ? 'Terhubung ke internet' : 'Mode Offline Aktif (Data disimpan lokal)'}
          >
            {isOnline ? (
              <>
                <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                <span className="text-[11px]">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                <span className="text-[11px]">Offline</span>
              </>
            )}
          </div>

          {/* Active Shift Indicator */}
          {!activeShift && (
            <button
              onClick={onOpenCashierModal}
              className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/20 text-amber-100 rounded-full text-xs border border-amber-400/40 font-semibold"
            >
              <Clock className="w-3.5 h-3.5" />
              <span className="text-[11px]">Shift belum dibuka</span>
            </button>
          )}
          {activeShift && activeShift.status === 'open' && (
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 bg-[#5D4037] text-white rounded-full text-xs border border-white/10">
              <Clock className="w-3.5 h-3.5 text-[#D7CCC8]" />
              <span className="text-[11px] font-medium">Shift: {formatIDR(activeShift.totalSalesCash + activeShift.totalSalesNonCash)}</span>
            </div>
          )}

          {/* Cashier Badge & Switcher Button */}
          <button
            onClick={onOpenCashierModal}
            className="flex items-center gap-2 bg-[#5D4037] hover:bg-[#6D4C41] text-white border border-white/10 px-3 py-1.5 rounded-lg transition-all text-xs font-medium shadow-sm group"
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                activeCashier.avatarColor || 'bg-[#D7CCC8] text-[#3E2723]'
              }`}
            >
              {activeCashier.name.charAt(0)}
            </div>
            <div className="text-left">
              <div className="font-semibold text-white leading-tight flex items-center gap-1">
                <span>{activeCashier.name}</span>
                <RefreshCw className="w-3 h-3 text-[#D7CCC8] group-hover:rotate-180 transition-transform" />
              </div>
              <div className="text-[10px] text-[#D7CCC8] opacity-80 leading-none">{activeCashier.role}</div>
            </div>
          </button>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-2 sm:px-6 overflow-x-auto scrollbar-none border-t border-white/10">
        <nav className="flex items-center gap-1 py-1.5 min-w-max">
          <button
            onClick={() => setActiveTab('pos')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
              activeTab === 'pos'
                ? 'bg-[#D7CCC8] text-[#3E2723] shadow'
                : 'text-white/80 hover:bg-[#5D4037] hover:text-white'
            }`}
          >
            <Coffee className="w-4 h-4" />
            <span>Kasir / POS</span>
            {cartItemCount > 0 && (
              <span className="bg-[#3E2723] text-white px-1.5 py-0.5 rounded-full text-[10px] font-black ml-1">
                {cartItemCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
              activeTab === 'history'
                ? 'bg-[#D7CCC8] text-[#3E2723] shadow'
                : 'text-white/80 hover:bg-[#5D4037] hover:text-white'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Riwayat Transaksi</span>
          </button>

          {can(activeCashier.role, 'menu') && (
          <button
            onClick={() => setActiveTab('menu')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
              activeTab === 'menu'
                ? 'bg-[#D7CCC8] text-[#3E2723] shadow'
                : 'text-white/80 hover:bg-[#5D4037] hover:text-white'
            }`}
          >
            <UtensilsCrossed className="w-4 h-4" />
            <span>Katalog Menu</span>
          </button>
          )}

          {can(activeCashier.role, 'cashiers') && (
          <button
            onClick={() => setActiveTab('cashiers')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
              activeTab === 'cashiers'
                ? 'bg-[#D7CCC8] text-[#3E2723] shadow'
                : 'text-white/80 hover:bg-[#5D4037] hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Kelola Kasir & Shift</span>
          </button>
          )}

          {can(activeCashier.role, 'reports') && (
          <button
            onClick={() => setActiveTab('reports')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
              activeTab === 'reports'
                ? 'bg-[#D7CCC8] text-[#3E2723] shadow'
                : 'text-white/80 hover:bg-[#5D4037] hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Laporan Penjualan</span>
          </button>
          )}

          {can(activeCashier.role, 'settings') && (
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
              activeTab === 'settings'
                ? 'bg-[#D7CCC8] text-[#3E2723] shadow'
                : 'text-white/80 hover:bg-[#5D4037] hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Pengaturan Struk</span>
          </button>
          )}
        </nav>
      </div>
    </header>
  );
};
