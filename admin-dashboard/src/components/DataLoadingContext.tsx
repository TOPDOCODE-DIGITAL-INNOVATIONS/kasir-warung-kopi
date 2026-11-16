'use client'

import { createContext, useCallback, useContext, useId, useState, useTransition, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

type Task = () => void | Promise<void>
const DataLoadingContext = createContext<{ scope: string; source: string; pending: boolean; run: (scope: string, source: string, task: Task) => void } | null>(null)

export function DataLoadingProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState({ scope: '', source: '' }), [pending, startTransition] = useTransition()
  const run = useCallback((scope: string, source: string, task: Task) => {
    setRequest({ scope, source })
    startTransition(task)
  }, [])
  return <DataLoadingContext.Provider value={{ ...request, pending, run }}>{children}</DataLoadingContext.Provider>
}

export function useDataTransition() {
  const context = useContext(DataLoadingContext), pathname = usePathname()
  const source = useId()
  const [localPending, localTransition] = useTransition()
  return {
    pending: context ? context.pending && context.scope === pathname && context.source === source : localPending,
    startTransition: (task: Task) => context ? context.run(pathname, source, task) : localTransition(task),
  }
}

export function useDataLoading() {
  const context = useContext(DataLoadingContext), pathname = usePathname()
  return !!context?.pending && context.scope === pathname
}
