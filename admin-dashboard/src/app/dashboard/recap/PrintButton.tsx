'use client'

import { Printer } from 'lucide-react'

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg px-3 py-2.5 shadow-sm hover:bg-gray-50"
    >
      <Printer className="w-4 h-4" /> Cetak
    </button>
  )
}
