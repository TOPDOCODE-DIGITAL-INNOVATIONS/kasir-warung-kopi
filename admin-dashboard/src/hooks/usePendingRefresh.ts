'use client'

import { useRouter } from 'next/navigation'
import { useDataLoading, useDataTransition } from '@/components/DataLoadingContext'

export function usePendingRefresh() {
  const router = useRouter(), { pending, startTransition } = useDataTransition()
  const routePending = useDataLoading(), refreshing = pending || routePending
  return { refreshing, refresh: () => startTransition(() => router.refresh()) }
}
