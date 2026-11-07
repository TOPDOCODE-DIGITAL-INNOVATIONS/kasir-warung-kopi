import React from 'react';
import { createPortal } from 'react-dom';
import { charsPerLine, PaperWidth, ReceiptLine, renderLineText } from '../../lib/receipt';

interface ThermalReceiptProps {
  lines: ReceiptLine[];
  paper: PaperWidth;
}

/** Lebar area cetak: 58mm → 48mm, 80mm → 72mm. */
const PRINT_WIDTH_MM: Record<PaperWidth, number> = { 58: 48, 80: 72 };

const ReceiptBody: React.FC<ThermalReceiptProps & { fontSize: string; fitWidth?: boolean }> = ({
  lines,
  paper,
  fontSize,
  fitWidth,
}) => (
  <div
    className="thermal-receipt"
    style={{
      width: fitWidth ? `${charsPerLine(paper)}ch` : undefined,
      fontFamily: '"Courier New", Courier, monospace',
      fontSize,
      lineHeight: 1.15,
      whiteSpace: 'pre',
      color: '#000',
    }}
  >
    {lines.map((line, i) => (
      <div
        key={i}
        style={{
          fontWeight: line.bold ? 700 : 400,
          fontSize: line.double ? '2em' : undefined,
          lineHeight: line.double ? 1.05 : undefined,
        }}
      >
        {renderLineText(line, paper) || ' '}
      </div>
    ))}
  </div>
);

/**
 * Pratinjau di layar: lebar mengikuti jumlah karakter (32 untuk 58mm),
 * jadi tampilannya sama dengan hasil cetak printer thermal.
 */
export const ThermalReceiptPreview: React.FC<ThermalReceiptProps> = ({ lines, paper }) => (
  <div className="mx-auto w-fit max-w-full bg-white shadow-inner border border-stone-200 px-3 py-4 overflow-x-auto">
    <ReceiptBody lines={lines} paper={paper} fontSize="12px" fitWidth />
  </div>
);

/**
 * Versi cetak: di-portal ke <body> dan hanya terlihat saat window.print().
 * Ukuran huruf dihitung agar `charsPerLine` karakter Courier (lebar 0.6em) pas di area cetak.
 */
export const ThermalReceiptPrintPortal: React.FC<ThermalReceiptProps> = ({ lines, paper }) => {
  const widthMm = PRINT_WIDTH_MM[paper];
  const fontSizeMm = widthMm / charsPerLine(paper) / 0.6;
  const PAD_TOP_MM = 1;
  const PAD_BOTTOM_MM = 2;

  // Tinggi halaman = tinggi isi struk yang benar-benar terukur (bukan perkiraan),
  // supaya printer tidak menggulung kertas kosong. Elemen ini tetap ter-render
  // (tak terlihat, di luar layar) agar bisa diukur sebelum dialog cetak dibuka.
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [pageHeightMm, setPageHeightMm] = React.useState<number | null>(null);

  React.useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => {
      const px = el.getBoundingClientRect().height;
      if (px > 0) setPageHeightMm(Math.ceil((px * 25.4) / 96) + 1); // 96 CSS px = 1 inch
    };
    measure();
    // Ukur ulang setelah font termuat
    document.fonts?.ready.then(measure).catch(() => {});
  }, [lines, paper]);

  const pageSize = `${paper}mm ${pageHeightMm ?? 100}mm`;

  return createPortal(
    <div className="receipt-print-root">
      <style>{`@media print { @page { size: ${pageSize}; margin: 0; } html, body { width: ${paper}mm; height: auto !important; min-height: 0 !important; } }`}</style>
      <div
        ref={contentRef}
        style={{ width: `${widthMm}mm`, margin: '0 auto', padding: `${PAD_TOP_MM}mm 0 ${PAD_BOTTOM_MM}mm` }}
      >
        <ReceiptBody lines={lines} paper={paper} fontSize={`${fontSizeMm.toFixed(3)}mm`} />
      </div>
    </div>,
    document.body
  );
};
