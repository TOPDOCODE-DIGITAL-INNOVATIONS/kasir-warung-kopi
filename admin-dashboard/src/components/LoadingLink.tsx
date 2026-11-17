'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentProps } from 'react'
import { useDataTransition } from './DataLoadingContext'

export default function LoadingLink({ children, href, ...props }: Omit<ComponentProps<typeof Link>, 'href' | 'onNavigate'> & { href: string }) {
  const router = useRouter(), { startTransition } = useDataTransition()
  return <Link {...props} href={href} onNavigate={event => {
    event.preventDefault()
    startTransition(() => router.push(href, { scroll: props.scroll ?? false }))
  }}>{children}</Link>
}
