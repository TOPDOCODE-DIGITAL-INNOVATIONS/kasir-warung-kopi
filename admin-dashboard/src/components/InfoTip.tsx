'use client'

import { Info } from 'lucide-react'
import Tooltip from './Tooltip'

/** Ikon info kecil yang menampilkan penjelasan saat hover/fokus. */
export default function InfoTip({ label, text, tone = 'light', side = 'top' }: {
  label: string; text: string; tone?: 'light' | 'dark'; side?: 'top' | 'bottom' | 'right'
}) {
  return <Tooltip side={side} content={text}>
    <button type="button" aria-label={`Info ${label}: ${text}`}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 ${
        tone === 'dark' ? 'text-white/45 hover:bg-white/10 hover:text-white' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'}`}>
      <Info aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  </Tooltip>
}
