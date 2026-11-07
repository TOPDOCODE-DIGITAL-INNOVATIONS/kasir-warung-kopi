import React, { useState } from 'react';
import { Settings, Store, QrCode, Building2, Save, Check, Database, RefreshCw, Printer } from 'lucide-react';
import { StoreSettings } from '../types';
import { getStoreSettings, saveStoreSettings, performCloudSync } from '../lib/storage';
import {
  PRINTER_METHOD_LABELS,
  PrinterMethod,
  buildTestLines,
  connectPrinter,
  forgetPrinter,
  getPaperWidth,
  getPrinterMethod,
  isDirectMethod,
  isPrinterMethodSupported,
  printLines,
  shouldAutoPrint,
} from '../lib/printer';
import { ThermalReceiptPrintPortal } from './POS/ThermalReceipt';

interface SettingsModalProps {
  onSettingsUpdated: (settings: StoreSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onSettingsUpdated }) => {
  const [settings, setSettings] = useState<StoreSettings>(getStoreSettings());
  const [isSaved, setIsSaved] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveStoreSettings(settings);
    onSettingsUpdated(settings);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  const [printMsg, setPrintMsg] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const printerMethod: PrinterMethod = getPrinterMethod(settings);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnectPrinter = async () => {
    setPrintMsg(null);
    setIsConnecting(true);
    try {
      const msg = await connectPrinter(settings);
      saveStoreSettings(settings); // simpan metode yang dipilih
      onSettingsUpdated(settings);
      setPrintMsg({ type: 'success', msg });
    } catch (err: any) {
      if (err?.name !== 'NotFoundError') {
        setPrintMsg({ type: 'error', msg: err?.message || 'Gagal menghubungkan printer.' });
      }
    } finally {
      setIsConnecting(false);
    }
  };
  const testLines = buildTestLines(settings);

  const handleTestPrint = async () => {
    setPrintMsg(null);
    try {
      await printLines(testLines, settings);
      if (isDirectMethod(printerMethod)) setPrintMsg({ type: 'success', msg: 'Data struk uji terkirim ke printer.' });
    } catch (err: any) {
      if (err?.name !== 'NotFoundError') {
        setPrintMsg({ type: 'error', msg: err?.message || 'Gagal mencetak.' });
      }
    }
  };

  const handleTestSync = async () => {
    setIsSyncing(true);
    setSyncStatusMsg(null);
    saveStoreSettings(settings); // save latest configuration first
    const res = await performCloudSync();
    setIsSyncing(false);
    if (res.success) {
      setSyncStatusMsg({ type: 'success', msg: res.message });
    } else {
      setSyncStatusMsg({ type: 'error', msg: res.message });
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-6 space-y-4 text-[#2C2420]">
      {/* Header */}
      <div className="bg-white border border-[#D7CCC8] p-3.5 rounded-lg flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#EFEBE9] text-[#3E2723] rounded border border-[#D7CCC8]">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-extrabold text-sm sm:text-base text-[#3E2723] uppercase tracking-tight">Pengaturan Toko & Struk</h2>
            <p className="text-xs text-stone-500">Atur profil warung kopi, footer cetak struk, QRIS & info bank transfer</p>
          </div>
        </div>

        {isSaved && (
          <div className="px-3 py-1.5 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded font-bold text-xs flex items-center gap-1.5 animate-bounce">
            <Check className="w-4 h-4 text-emerald-700" />
            <span>Tersimpan!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Profile Toko & Header Struk */}
        <div className="bg-white border border-[#D7CCC8] p-3.5 rounded-lg space-y-3 shadow-sm">
          <h3 className="font-extrabold text-xs text-[#3E2723] uppercase tracking-wider flex items-center gap-2 border-b border-[#EFEBE9] pb-2">
            <Store className="w-4 h-4 text-[#3E2723]" />
            <span>Profil Toko & Informasi Struk</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[#3E2723] block mb-1">Nama Warung Kopi</label>
              <input
                type="text"
                required
                value={settings.storeName}
                onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#3E2723] font-bold"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#3E2723] block mb-1">Slogan / Tagline</label>
              <input
                type="text"
                value={settings.storeTagline}
                onChange={(e) => setSettings({ ...settings, storeTagline: e.target.value })}
                className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#3E2723]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[#3E2723] block mb-1">Alamat Lengkap</label>
              <input
                type="text"
                value={settings.address}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#3E2723]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#3E2723] block mb-1">No. HP / WhatsApp Toko</label>
              <input
                type="text"
                value={settings.phone}
                onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#3E2723]"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-[#3E2723] block mb-1">Pesan Ucapan di Bawah Struk (Footer)</label>
            <input
              type="text"
              value={settings.receiptFooterMsg}
              onChange={(e) => setSettings({ ...settings, receiptFooterMsg: e.target.value })}
              className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#3E2723]"
            />
          </div>
        </div>

        {/* QRIS Statis Configuration */}
        <div className="bg-white border border-[#D7CCC8] p-3.5 rounded-lg space-y-3 shadow-sm">
          <h3 className="font-extrabold text-xs text-[#3E2723] uppercase tracking-wider flex items-center gap-2 border-b border-[#EFEBE9] pb-2">
            <QrCode className="w-4 h-4 text-[#3E2723]" />
            <span>Informasi QRIS Statis</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[#3E2723] block mb-1">Nama Merchant QRIS</label>
              <input
                type="text"
                value={settings.qrisMerchantName}
                onChange={(e) => setSettings({ ...settings, qrisMerchantName: e.target.value })}
                className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#3E2723]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#3E2723] block mb-1">NMID / Kode QRIS</label>
              <input
                type="text"
                value={settings.qrisNmid || ''}
                onChange={(e) => setSettings({ ...settings, qrisNmid: e.target.value })}
                className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#3E2723]"
              />
            </div>
          </div>
        </div>

        {/* Bank Transfer Configuration */}
        <div className="bg-white border border-[#D7CCC8] p-3.5 rounded-lg space-y-3 shadow-sm">
          <h3 className="font-extrabold text-xs text-[#3E2723] uppercase tracking-wider flex items-center gap-2 border-b border-[#EFEBE9] pb-2">
            <Building2 className="w-4 h-4 text-[#3E2723]" />
            <span>Rekening Bank & E-Wallet</span>
          </h3>

          <div className="space-y-2">
            {settings.bankAccounts.map((bank, idx) => (
              <div key={idx} className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Nama Bank (BCA)"
                  value={bank.bankName}
                  onChange={(e) => {
                    const updated = [...settings.bankAccounts];
                    updated[idx].bankName = e.target.value;
                    setSettings({ ...settings, bankAccounts: updated });
                  }}
                  className="bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs font-bold focus:outline-none focus:border-[#3E2723]"
                />

                <input
                  type="text"
                  placeholder="No Rekening"
                  value={bank.accountNumber}
                  onChange={(e) => {
                    const updated = [...settings.bankAccounts];
                    updated[idx].accountNumber = e.target.value;
                    setSettings({ ...settings, bankAccounts: updated });
                  }}
                  className="bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-[#3E2723]"
                />

                <input
                  type="text"
                  placeholder="Atas Nama (a.n)"
                  value={bank.accountHolder}
                  onChange={(e) => {
                    const updated = [...settings.bankAccounts];
                    updated[idx].accountHolder = e.target.value;
                    setSettings({ ...settings, bankAccounts: updated });
                  }}
                  className="bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#3E2723]"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Printer Struk */}
        <div className="bg-white border border-[#D7CCC8] p-3.5 rounded-lg space-y-3 shadow-sm">
          <h3 className="font-extrabold text-xs text-[#3E2723] uppercase tracking-wider flex items-center gap-2 border-b border-[#EFEBE9] pb-2">
            <Printer className="w-4 h-4 text-[#3E2723]" />
            <span>Printer Struk (Thermal)</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[#3E2723] block mb-1">Cara Cetak</label>
              <select
                value={printerMethod}
                onChange={(e) => {
                  forgetPrinter();
                  setPrintMsg(null);
                  setSettings({ ...settings, printerMethod: e.target.value as PrinterMethod });
                }}
                className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#3E2723]"
              >
                {(Object.keys(PRINTER_METHOD_LABELS) as PrinterMethod[]).map((m) => (
                  <option key={m} value={m} disabled={!isPrinterMethodSupported(m)}>
                    {PRINTER_METHOD_LABELS[m]}
                    {!isPrinterMethodSupported(m) ? ' (tidak didukung di perangkat ini)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-[#3E2723] block mb-1">Lebar Kertas</label>
              <select
                value={getPaperWidth(settings)}
                onChange={(e) =>
                  setSettings({ ...settings, printerPaperWidth: Number(e.target.value) === 80 ? 80 : 58 })
                }
                className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#3E2723]"
              >
                <option value={58}>58mm – 32 karakter (VSC/Rongta RPP02N)</option>
                <option value={80}>80mm – 48 karakter</option>
              </select>
            </div>
          </div>

          <div className="text-[11px] text-stone-600 bg-[#FAF8F6] border border-[#D7CCC8] rounded p-2.5 space-y-1">
            {printerMethod === 'serial' && (
              <>
                <p className="font-bold text-[#3E2723]">Cetak langsung ke RPP02N (tanpa dialog):</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Nyalakan printer, lalu pair di Pengaturan Bluetooth HP/laptop (PIN 0000 atau 1234).</li>
                  <li>Tekan <strong>Hubungkan Printer</strong> dan pilih RPP02N (cukup sekali).</li>
                  <li>Selanjutnya struk langsung tercetak setiap pembayaran selesai.</li>
                </ol>
                <p>Butuh Chrome terbaru (Android 138+ / desktop). Bisa juga lewat kabel USB.</p>
              </>
            )}
            {printerMethod === 'bluetooth' && (
              <p>
                Untuk printer yang mendukung Bluetooth LE. Tekan <strong>Hubungkan Printer</strong> sekali, lalu
                struk dicetak langsung. Jika RPP02N tidak muncul, gunakan metode “Bluetooth klasik / USB”.
              </p>
            )}
            {printerMethod === 'rawbt' && (
              <p>
                Install RawBT dari Play Store dan pilih printer di sana. Setiap cetak akan membuka RawBT sebentar.
                Gunakan metode “Langsung” bila ingin tanpa pindah aplikasi.
              </p>
            )}
            {printerMethod === 'browser' && (
              <p>
                Akan muncul dialog cetak setiap kali. Pilih printer RPP02N, kertas 58mm, margin None, skala 100%.
                Untuk tanpa dialog di PC, jalankan Chrome dengan opsi <code>--kiosk-printing</code>, atau gunakan
                metode “Langsung”.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="receiptCompact"
              checked={settings.receiptCompact !== false}
              onChange={(e) => setSettings({ ...settings, receiptCompact: e.target.checked })}
              className="rounded text-[#3E2723] focus:ring-[#3E2723]"
            />
            <label htmlFor="receiptCompact" className="text-xs font-bold text-[#2C2420]">
              Struk ringkas (hemat kertas ±40%)
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoPrintAfterPayment"
                checked={shouldAutoPrint(settings)}
                onChange={(e) => setSettings({ ...settings, autoPrintAfterPayment: e.target.checked })}
                className="rounded text-[#3E2723] focus:ring-[#3E2723]"
              />
              <label htmlFor="autoPrintAfterPayment" className="text-xs font-bold text-[#2C2420]">
                Cetak struk otomatis setelah pembayaran
              </label>
            </div>

            <div className="flex gap-2">
            {isDirectMethod(printerMethod) && (
              <button
                type="button"
                onClick={handleConnectPrinter}
                disabled={isConnecting || !isPrinterMethodSupported(printerMethod)}
                className="py-1.5 px-3 bg-[#3E2723] hover:bg-[#5D4037] text-white font-bold rounded text-xs flex items-center gap-1.5 uppercase transition-all disabled:opacity-50"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{isConnecting ? 'Menghubungkan...' : 'Hubungkan Printer'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleTestPrint}
              className="py-1.5 px-3 bg-[#EFEBE9] hover:bg-[#D7CCC8] text-[#3E2723] font-bold rounded text-xs border border-[#D7CCC8] flex items-center gap-1.5 uppercase transition-all"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Tes Printer</span>
            </button>
            </div>
          </div>

          {printMsg && (
            <div
              className={`p-2.5 rounded text-xs font-medium border ${
                printMsg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  : 'bg-rose-50 text-rose-900 border-rose-300'
              }`}
            >
              {printMsg.msg}
            </div>
          )}

          {printerMethod === 'browser' && (
            <ThermalReceiptPrintPortal lines={testLines} paper={getPaperWidth(settings)} />
          )}
          <p className="text-[10px] text-stone-500">Simpan pengaturan agar dipakai saat transaksi.</p>
        </div>

        {/* Sync API Configuration (PostgreSQL Website) */}
        <div className="bg-white border border-[#D7CCC8] p-3.5 rounded-lg space-y-3 shadow-sm">
          <h3 className="font-extrabold text-xs text-[#3E2723] uppercase tracking-wider flex items-center justify-between border-b border-[#EFEBE9] pb-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-[#3E2723]" />
              <span>Sinkronisasi ke Website (PostgreSQL API)</span>
            </div>
            {settings.lastSyncedAt && (
              <span className="text-[10px] text-stone-500 font-normal">
                Sync Terakhir: {new Date(settings.lastSyncedAt).toLocaleString('id-ID')}
              </span>
            )}
          </h3>

          <p className="text-xs text-stone-600">
            Hubungkan kasir offline ini dengan REST API website Anda agar transaksi (termasuk pembatalan & pelunasan bon)
            otomatis terkirim.
          </p>

          {settings.lastSyncError && (
            <div className="p-2.5 rounded text-xs font-medium border bg-amber-50 text-amber-900 border-amber-300">
              Sync terakhir gagal: {settings.lastSyncError}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-[#3E2723] block mb-1">
                URL Endpoint Sync API Website (POST)
              </label>
              <input
                type="url"
                placeholder="https://website-warkop.com/api/pos/sync"
                value={settings.syncApiUrl || ''}
                onChange={(e) => setSettings({ ...settings, syncApiUrl: e.target.value })}
                className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-[#3E2723]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#3E2723] block mb-1">
                Secret API Key / Bearer Token (Opsional Security)
              </label>
              <input
                type="password"
                placeholder="secret-token-warkop-123"
                autoComplete="off"
                value={settings.syncApiKey || ''}
                onChange={(e) => setSettings({ ...settings, syncApiKey: e.target.value })}
                className="w-full bg-white border border-[#D7CCC8] text-[#2C2420] rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-[#3E2723]"
              />
              <p className="text-[10px] text-stone-500 mt-1">
                Token disimpan di perangkat ini saja dan tidak ikut di file backup. Gunakan token khusus kasir
                yang bisa dicabut dari server, bukan password akun Owner.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoSyncOnline"
                  checked={settings.autoSyncOnline ?? true}
                  onChange={(e) => setSettings({ ...settings, autoSyncOnline: e.target.checked })}
                  className="rounded text-[#3E2723] focus:ring-[#3E2723]"
                />
                <label htmlFor="autoSyncOnline" className="text-xs font-bold text-[#2C2420]">
                  Otomatis sync saat online (setiap ada perubahan & tiap 5 menit)
                </label>
              </div>

              <button
                type="button"
                onClick={handleTestSync}
                disabled={isSyncing}
                className="py-1.5 px-3 bg-[#EFEBE9] hover:bg-[#D7CCC8] text-[#3E2723] font-bold rounded text-xs border border-[#D7CCC8] flex items-center gap-1.5 uppercase transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Menghubungkan...' : 'Tes Sync Sekarang'}</span>
              </button>
            </div>

            {syncStatusMsg && (
              <div
                className={`p-2.5 rounded text-xs font-medium border ${
                  syncStatusMsg.type === 'success'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    : 'bg-rose-50 text-rose-900 border-rose-300'
                }`}
              >
                {syncStatusMsg.msg}
              </div>
            )}
          </div>
        </div>

        {/* Save Submit Button */}
        <button
          type="submit"
          className="w-full py-2.5 bg-[#3E2723] hover:bg-[#5D4037] text-white font-extrabold rounded text-xs uppercase shadow tracking-wider flex items-center justify-center gap-2 transition-all"
        >
          <Save className="w-4 h-4 stroke-[2.5]" />
          <span>Simpan Pengaturan Toko</span>
        </button>
      </form>
    </div>
  );
};
