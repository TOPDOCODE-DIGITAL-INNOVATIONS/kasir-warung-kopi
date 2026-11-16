import React, { useLayoutEffect, useRef, useState } from 'react';
import { caretAfterFormat, formatRupiahInput, parseRupiah } from '../lib/money';

interface RupiahInputProps {
  value: number;
  onChange: (value: number) => void;
  /** Tampilkan awalan "Rp" di dalam kotak input (default true) */
  prefix?: boolean;
  /** Nilai 0 ditampilkan kosong (default true). Matikan untuk isian yang 0-nya bermakna, mis. hitung kas. */
  emptyWhenZero?: boolean;
  /** Nilai maksimum yang boleh diketik */
  max?: number;
  placeholder?: string;
  className?: string;
  prefixClassName?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  id?: string;
  'aria-label'?: string;
}

/**
 * Input nominal rupiah: otomatis diberi titik ribuan saat mengetik (50000 -> 50.000),
 * keyboard angka di HP, dan nilai yang dikirim ke `onChange` selalu berupa angka bulat.
 */
export const RupiahInput: React.FC<RupiahInputProps> = ({
  value,
  onChange,
  prefix = true,
  emptyWhenZero = true,
  max,
  placeholder = '0',
  className = '',
  prefixClassName = 'text-[#3E2723]',
  disabled,
  required,
  autoFocus,
  id,
  'aria-label': ariaLabel,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  // Saat kotak dikosongkan, tetap tampil kosong walau nilainya 0.
  const [cleared, setCleared] = useState(false);

  const text = (value === 0 && (emptyWhenZero || cleared)) ? '' : formatRupiahInput(value);

  useLayoutEffect(() => {
    if (pendingCaret.current !== null && inputRef.current && document.activeElement === inputRef.current) {
      inputRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    }
    pendingCaret.current = null;
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const caret = e.target.selectionStart ?? raw.length;
    const digitsRight = raw.slice(caret).replace(/\D/g, '').length;
    let next = parseRupiah(raw);
    if (max !== undefined && next > max) next = max;
    const nextText = next === 0 && raw.replace(/\D/g, '') === '' ? '' : formatRupiahInput(next);
    pendingCaret.current = caretAfterFormat(nextText, digitsRight);
    setCleared(nextText === '');
    onChange(next);
  };

  const input = (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={text}
      placeholder={placeholder}
      onChange={handleChange}
      onBlur={() => setCleared(false)}
      disabled={disabled}
      required={required}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      className={`${className} ${prefix ? 'pl-9' : ''} tabular-nums`}
    />
  );

  if (!prefix) return input;
  return (
    <div className="relative">
      <span className={`absolute left-3 top-1/2 -translate-y-1/2 font-bold text-xs pointer-events-none ${prefixClassName}`}>
        Rp
      </span>
      {input}
    </div>
  );
};
