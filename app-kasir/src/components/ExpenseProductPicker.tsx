import { useEffect, useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { ExpensePurchaseCatalog, ExpensePurchaseProduct } from '../../../shared/expense-products';
import { getExpensePurchaseCatalog, POS_UPDATE_EVENT, searchExpensePurchaseProducts } from '../lib/storage';

const other = 'Lain-lain';
const selectionMessage = 'Pilih produk dari daftar atau pilih Lain-lain.';

export default function ExpenseProductPicker({ inputClass, excludedIds, onSelect }: {
  inputClass: string;
  excludedIds: string[];
  onSelect: (product: ExpensePurchaseProduct | null, businessId: string | null, fallbackName?: string) => void;
}) {
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [selection, setSelection] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [cached, setCached] = useState(getExpensePurchaseCatalog);
  const [remote, setRemote] = useState<{ term: string; catalog?: ExpensePurchaseCatalog }>();
  const term = text.trim() === selection ? '' : text.trim();

  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      setCached(getExpensePurchaseCatalog());
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener(POS_UPDATE_EVENT, update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener(POS_UPDATE_EVENT, update);
    };
  }, []);

  useEffect(() => {
    if (!open || !online) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchExpensePurchaseProducts(term, controller.signal).then(catalog => {
        if (!controller.signal.aborted) {
          setRemote({ term, catalog });
          setCached(getExpensePurchaseCatalog());
        }
      }).catch(() => {
        if (!controller.signal.aborted) setRemote({ term });
      });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, online, term]);

  const latest = online && remote?.term === term ? remote : undefined;
  const catalog = latest?.catalog ?? cached;
  const matches = latest?.catalog ? latest.catalog.products
    : (cached?.products ?? []).filter(product => product.name.toLocaleLowerCase('id').includes(term.toLocaleLowerCase('id')));
  const choices = [null, ...matches];
  const message = !online ? 'Kamu sedang offline.'
    : !latest ? 'Mencari produk...'
    : !latest.catalog ? 'Katalog belum bisa dimuat. Menampilkan produk yang tersimpan.'
    : !matches.length ? 'Produk tidak ditemukan.' : '';

  function choose(product: ExpensePurchaseProduct | null) {
    if (product && excludedIds.includes(product.id)) return;
    const name = product?.name ?? other;
    setText(name);
    setSelection(name);
    field.current?.setCustomValidity('');
    const fallbackName = !product && term && term.toLocaleLowerCase('id') !== other.toLocaleLowerCase('id') ? term : undefined;
    onSelect(product, catalog?.businessId ?? null, fallbackName);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className="relative" onBlur={() => { setOpen(false); setActive(-1); }}>
      <label htmlFor={id} className="mb-1 block text-xs font-bold text-[#3E2723]">Produk / Lain-lain</label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
        <input ref={field} id={id} type="text" role="combobox" autoComplete="off" maxLength={150}
          value={text} placeholder="Lain-lain / cari produk" className={`${inputClass} pl-9`}
          aria-expanded={open} aria-autocomplete="list" aria-controls={open ? `${id}-options` : undefined}
          aria-activedescendant={open && active >= 0 && active < choices.length ? `${id}-option-${active}` : undefined}
          onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
          onChange={event => {
            const value = event.target.value;
            setText(value);
            setActive(-1);
            setOpen(true);
            event.currentTarget.setCustomValidity(value === selection ? '' : selectionMessage);
          }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              const step = event.key === 'ArrowDown' ? 1 : -1;
              const start = active < 0 && step === -1 ? 0 : active;
              let next = (start + step + choices.length) % choices.length;
              while (choices[next] && excludedIds.includes(choices[next]!.id)) next = (next + step + choices.length) % choices.length;
              setActive(next);
              requestAnimationFrame(() => document.getElementById(`${id}-option-${next}`)?.scrollIntoView({ block: 'nearest' }));
            } else if (event.key === 'Enter' && open) {
              event.preventDefault();
              if (active >= 0 && active < choices.length) choose(choices[active]);
            } else if (event.key === 'Escape' && open) {
              event.preventDefault();
              setOpen(false);
              setActive(-1);
            }
          }}
        />
      </div>
      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded border border-[#D7CCC8] bg-white shadow-lg">
          <div id={`${id}-options`} role="listbox" aria-label="Pilihan produk pengeluaran">
            {choices.map((product, index) => (
              <button key={product?.id ?? 'other'} id={`${id}-option-${index}`} type="button" role="option" tabIndex={-1}
                aria-selected={active === index} disabled={!!product && excludedIds.includes(product.id)}
                onMouseDown={event => event.preventDefault()} onClick={() => choose(product)}
                className={`block w-full px-3 py-2 text-left text-sm disabled:opacity-50 ${active === index ? 'bg-[#EFEBE9]' : 'hover:bg-[#FAF8F6]'}`}>
                {product?.name ?? other}
              </button>
            ))}
          </div>
          {message && <p role="status" className="border-t border-[#EFEBE9] px-3 py-2 text-xs text-stone-500">{message}</p>}
        </div>
      )}
    </div>
  );
}
