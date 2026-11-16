import { Loader2 } from 'lucide-react'

export default function LoadingSpinner({ label = 'Memuat data...', className = '', showLabel = false }: {
  label?: string; className?: string; showLabel?: boolean
}) {
  return <span role="status" aria-label={label} className={`inline-flex items-center gap-2 align-middle ${className}`}>
    <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" />
    {showLabel && <span>{label}</span>}
  </span>
}
