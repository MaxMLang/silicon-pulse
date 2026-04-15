'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clsx } from 'clsx'

const NAV_ITEMS = [
  { href: '/', label: 'Home' },
  { href: '/longitudinal', label: 'Longitudinal' },
  { href: '/comparison', label: 'Comparison' },
  { href: '/digest', label: 'Digest' },
  { href: '/about', label: 'About' },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <header className="border-b border-zinc-800 bg-zinc-950">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-8 h-14">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="text-zinc-200 font-mono text-sm font-bold tracking-tight">
            SILICON PULSE
          </span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap',
                pathname === item.href ||
                  (item.href !== '/' && pathname?.startsWith(`${item.href}/`))
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
