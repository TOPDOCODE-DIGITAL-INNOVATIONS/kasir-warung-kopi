import type { ReactNode } from 'react'
import PublicShell from './PublicShell'
import { LEGAL_UPDATED_AT } from '@/lib/legal'

export default function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl px-4 py-12 text-gray-700 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-gray-900 [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500">Terakhir diperbarui: {LEGAL_UPDATED_AT}</p>
        {children}
      </article>
    </PublicShell>
  )
}

export function ContactLine({ email, whatsapp }: { email: string | null; whatsapp: string | null }) {
  if (!email && !whatsapp) return <>melalui kontak yang tercantum di bagian bawah halaman ini</>
  return (
    <>
      {email && <>email <a className="text-blue-600 underline" href={`mailto:${email}`}>{email}</a></>}
      {email && whatsapp && ' atau '}
      {whatsapp && <>WhatsApp <a className="text-blue-600 underline" href={`https://wa.me/${whatsapp}`}>+{whatsapp}</a></>}
    </>
  )
}
