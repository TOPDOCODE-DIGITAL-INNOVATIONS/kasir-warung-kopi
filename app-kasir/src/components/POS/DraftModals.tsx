import React, { useState } from 'react';
import { ClipboardList, Trash2, FolderOpen, X, Save } from 'lucide-react';
import { DraftOrder } from '../../types';
import { formatIDR } from '../../lib/storage';

/** Total draf (subtotal - diskon, sebelum pajak) untuk ditampilkan di daftar. */
export function draftTotal(d: DraftOrder): number {
  const subtotal = d.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const disc = d.discountType === 'percent' ? Math.round((subtotal * d.discountAmount) / 100) : d.discountAmount;
  return subtotal - Math.min(subtotal, Math.max(0, disc));
}

function timeAgo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'baru saja';
  if (min < 60) return `${min} menit lalu`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} jam lalu`;
  return new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

interface DraftListModalProps {
  drafts: DraftOrder[];
  activeDraftId: string | null;
  onOpen: (draft: DraftOrder) => void;
  onDelete: (draft: DraftOrder) => void;
  onClose: () => void;
}

export const DraftListModal: React.FC<DraftListModalProps> = ({ drafts, activeDraftId, onOpen, onDelete, onClose }) => {
  const [search, setSearch] = useState('');
  const shown = drafts.filter((d) => d.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#D7CCC8] text-[#2C2420] rounded-xl max-w-md w-full max-h-[88vh] flex flex-col shadow-2xl">
        <div className="p-4 border-b border-[#D7CCC8] flex items-center gap-3 text-[#3E2723]">
          <ClipboardList className="w-5 h-5 shrink-0" />
          <h3 className="font-extrabold text-sm uppercase tracking-tight flex-1">Draf / Bayar Nanti ({drafts.length})</h3>
          <button onClick={onClose} aria-label="Tutup" className="p-1 rounded hover:bg-stone-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 border-b border-[#EFEBE9]">
          <input
            type="text"
            placeholder="Cari nama pelanggan / no. meja..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#F9F8F7] border border-[#D7CCC8] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#3E2723]"
          />
        </div>

        <div className="overflow-y-auto p-3 space-y-2 text-xs">
          {shown.length === 0 && (
            <p className="text-center text-stone-500 py-6">
              {drafts.length === 0 ? 'Belum ada draf. Simpan pesanan dengan tombol "Simpan Draf".' : 'Draf tidak ditemukan.'}
            </p>
          )}
          {shown.map((d) => (
            <div
              key={d.id}
              className={`border rounded-lg p-2.5 flex items-start gap-2 ${
                d.id === activeDraftId ? 'border-[#3E2723] bg-[#FAF8F6]' : 'border-[#D7CCC8]'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-black text-[#3E2723] truncate">
                  {d.label}
                  {d.id === activeDraftId && <span className="ml-1 text-[10px] font-bold text-stone-500">(sedang dibuka)</span>}
                </div>
                <div className="text-[10px] text-stone-500 uppercase font-semibold">
                  {d.orderType} · {d.items.reduce((a, b) => a + b.quantity, 0)} item · {timeAgo(d.createdAt)}
                </div>
                <div className="text-[11px] text-stone-600 truncate">
                  {d.items.map((i) => `${i.quantity}x ${i.product.name}`).join(', ')}
                </div>
                {d.notes && <div className="text-[11px] text-stone-500 italic truncate">{d.notes}</div>}
                <div className="text-[10px] text-stone-400">
                  oleh {d.updatedBy}
                  {d.deviceCode ? ` · HP ${d.deviceCode}` : ''}
                </div>
              </div>
              <div className="text-right space-y-1.5 shrink-0">
                <div className="font-black text-[#3E2723]">{formatIDR(draftTotal(d))}</div>
                <div className="flex gap-1 justify-end">
                  <button
                    onClick={() => onOpen(d)}
                    className="px-2 py-1 rounded bg-[#3E2723] text-white font-bold flex items-center gap-1"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    Buka
                  </button>
                  <button
                    onClick={() => onDelete(d)}
                    className="p-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50"
                    title="Hapus draf"
                    aria-label="Hapus draf"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

interface SaveDraftModalProps {
  initialLabel: string;
  initialNotes?: string;
  isUpdate: boolean;
  error?: string | null;
  onSave: (label: string, notes: string) => void;
  onClose: () => void;
}

export const SaveDraftModal: React.FC<SaveDraftModalProps> = ({
  initialLabel,
  initialNotes,
  isUpdate,
  error,
  onSave,
  onClose,
}) => {
  const [label, setLabel] = useState(initialLabel);
  const [notes, setNotes] = useState(initialNotes ?? '');

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(label, notes);
        }}
        className="bg-white border border-[#D7CCC8] text-[#2C2420] rounded-xl max-w-sm w-full p-5 space-y-3 shadow-2xl text-xs"
      >
        <div className="flex items-center gap-3 text-[#3E2723]">
          <Save className="w-5 h-5 shrink-0" />
          <h3 className="font-extrabold text-sm uppercase tracking-tight">
            {isUpdate ? 'Perbarui Draf' : 'Simpan Draf (Bayar Nanti)'}
          </h3>
        </div>
        <p className="text-stone-600">
          Pesanan disimpan tanpa pembayaran. Buka lagi dari tombol <b>Draf</b> untuk menambah pesanan atau membayar
          saat pelanggan pulang. Stok baru berkurang saat dibayar.
        </p>
        <div>
          <label className="font-bold text-[#3E2723] block mb-1">Nama Pelanggan / No. Meja (wajib)</label>
          <input
            autoFocus
            type="text"
            value={label}
            placeholder="Contoh: Meja 5 / Pak Budi"
            onChange={(e) => setLabel(e.target.value)}
            className="w-full bg-white border border-[#D7CCC8] rounded px-3 py-2 focus:outline-none focus:border-[#3E2723]"
          />
        </div>
        <div>
          <label className="font-bold text-[#3E2723] block mb-1">Catatan (opsional)</label>
          <input
            type="text"
            value={notes}
            placeholder="Contoh: duduk di teras"
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-white border border-[#D7CCC8] rounded px-3 py-2 focus:outline-none focus:border-[#3E2723]"
          />
        </div>
        {error && <p className="text-rose-700 font-semibold">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="w-1/2 py-2 bg-stone-100 hover:bg-stone-200 border border-[#D7CCC8] font-bold rounded"
          >
            Kembali
          </button>
          <button
            type="submit"
            disabled={!label.trim()}
            className="w-1/2 py-2 bg-[#3E2723] hover:bg-[#5D4037] text-white font-extrabold rounded shadow disabled:opacity-50"
          >
            Simpan Draf
          </button>
        </div>
      </form>
    </div>
  );
};
