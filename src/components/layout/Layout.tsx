import { useState, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { cn } from '../../lib/utils'

const STORAGE_KEY = 'akuarian:sidebar-collapsed'

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  })

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(collapsed))
  }, [collapsed])

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <Header collapsed={collapsed} />
      <main className={cn('pt-14 min-h-screen transition-all duration-200', collapsed ? 'lg:ml-16' : 'lg:ml-60')}>
        <div className="p-4 lg:p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
