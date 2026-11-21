import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import DataPanel from './DataPanel'
import InfoTip from './InfoTip'

/**
 * Komponen & token UI bersama dashboard KasirKu.
 * Dipakai semua halaman agar tata letak, jarak, dan hierarki konsisten.
 */

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500'
const btnBase = `inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${focus}`

export const ui = {
  panel: 'rounded-2xl border border-gray-200/70 bg-white shadow-sm',
  label: 'block text-xs font-medium text-gray-500',
  input: 'mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:opacity-60',
  inputBare: 'block w-full rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:opacity-60',
  btnPrimary: `${btnBase} bg-blue-600 px-4 py-2.5 text-white shadow-[0_8px_20px_-10px_rgb(138_106_48/0.8)] hover:bg-blue-700`,
  btnDark: `${btnBase} bg-espresso-900 px-4 py-2.5 text-white shadow-sm hover:bg-espresso-700`,
  btnSecondary: `${btnBase} border border-gray-200 bg-white px-4 py-2.5 text-gray-700 hover:border-gray-300 hover:bg-gray-50`,
  btnGhost: `${btnBase} px-3 py-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900`,
  btnDanger: `${btnBase} bg-red-600 px-4 py-2.5 text-white hover:bg-red-700`,
  btnDangerSoft: `${btnBase} border border-red-100 bg-red-50 px-3 py-2 text-red-700 hover:bg-red-100`,
  link: 'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-blue-700 hover:bg-blue-50',
  th: 'px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500',
  td: 'px-5 py-3.5 text-sm text-gray-700',
  thead: 'border-b border-gray-100 bg-gray-50/70',
  row: 'border-b border-gray-100 last:border-0 transition-colors hover:bg-blue-50/30',
  chip: (active: boolean) => cx(
    'inline-flex items-center rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors', focus,
    active ? 'bg-espresso-900 text-white shadow-sm' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 hover:text-gray-900',
  ),
}

const tones = {
  gold: 'bg-blue-50 text-blue-700 ring-blue-100',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  red: 'bg-red-50 text-red-600 ring-red-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  gray: 'bg-gray-100 text-gray-600 ring-gray-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-100',
}
export type Tone = keyof typeof tones

export function PageHeader({ eyebrow, title, description, actions, children }: {
  eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode
}) {
  return <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">{eyebrow}</p>}
      <h1 className="mt-1 text-[28px] leading-tight text-gray-900 sm:text-3xl">{title}</h1>
      {description && <div className="mt-1.5 max-w-2xl text-sm text-gray-500">{description}</div>}
      {children}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 print:hidden">{actions}</div>}
  </header>
}

export function Panel({ title, description, info, actions, children, className = '', bodyClassName = 'p-5 sm:p-6', loading, data = false, as: Tag = 'section' }: {
  title?: ReactNode; description?: ReactNode; info?: string; actions?: ReactNode; children: ReactNode
  className?: string; bodyClassName?: string; loading?: boolean; data?: boolean; as?: 'section' | 'div'
}) {
  const header = (title || actions) && <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
    <div className="min-w-0">
      {title && <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-gray-900">{title}{info && <InfoTip label={typeof title === 'string' ? title : 'Info'} text={info} />}</h2>}
      {description && <div className="mt-0.5 text-xs text-gray-500">{description}</div>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 print:hidden">{actions}</div>}
  </div>
  const body = <div className={bodyClassName}>{children}</div>
  if (data || loading !== undefined) return <DataPanel loading={loading} className={cx(ui.panel, className)}>{header}{body}</DataPanel>
  return <Tag className={cx(ui.panel, className)}>{header}{body}</Tag>
}

export function StatCard({ label, value, hint, info, icon: Icon, tone = 'gold', valueClassName = 'text-gray-900' }: {
  label: string; value: ReactNode; hint?: ReactNode; info?: string; icon?: LucideIcon; tone?: Tone; valueClassName?: string
}) {
  return <DataPanel compact className={cx(ui.panel, 'min-w-0 p-5 transition-shadow hover:shadow-md')}>
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1', tones[tone])}><Icon aria-hidden="true" className="h-4 w-4" /></span>}
        <p className="truncate text-[13px] font-medium text-gray-500">{label}</p>
      </div>
      {info && <InfoTip label={label} text={info} />}
    </div>
    <p className={cx('mt-3 truncate text-[22px] font-semibold tracking-tight tabular-nums', valueClassName)}>{value}</p>
    {hint && <p className="mt-1 truncate text-xs text-gray-400">{hint}</p>}
  </DataPanel>
}

export function Badge({ tone = 'gray', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset', tones[tone], className)}>{children}</span>
}

export function EmptyState({ icon: Icon, title, description, action, className = '' }: {
  icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode; className?: string
}) {
  return <div className={cx('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
    {Icon && <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-50 text-gray-400 ring-1 ring-gray-100"><Icon aria-hidden="true" className="h-5 w-5" /></span>}
    <p className="mt-4 text-sm font-semibold text-gray-900">{title}</p>
    {description && <div className="mt-1 max-w-sm text-sm text-gray-500">{description}</div>}
    {action && <div className="mt-5">{action}</div>}
  </div>
}

const noticeTones = {
  info: { box: 'border-blue-100 bg-blue-50/70 text-blue-900', Icon: Info },
  success: { box: 'border-emerald-100 bg-emerald-50 text-emerald-800', Icon: CheckCircle2 },
  warning: { box: 'border-amber-200/70 bg-amber-50 text-amber-900', Icon: AlertTriangle },
  error: { box: 'border-red-100 bg-red-50 text-red-700', Icon: XCircle },
}

export function Notice({ tone = 'info', children, className = '', role }: {
  tone?: keyof typeof noticeTones; children: ReactNode; className?: string; role?: 'alert' | 'status'
}) {
  const { box, Icon } = noticeTones[tone]
  return <div role={role ?? (tone === 'error' ? 'alert' : undefined)} className={cx('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', box, className)}>
    <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
    <div className="min-w-0 flex-1">{children}</div>
  </div>
}

/** Toolbar filter: field kiri, tombol kanan; dibungkus panel. */
export const filterBar = 'rounded-2xl border border-gray-200/70 bg-white p-4 shadow-sm sm:p-5'
