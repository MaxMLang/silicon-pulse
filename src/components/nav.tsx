'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clsx } from 'clsx'

const NAV_ITEMS = [
  { href: '/', label: 'Home' },
  { href: '/models', label: 'Models' },
  { href: '/longitudinal', label: 'Longitudinal' },
  { href: '/comparison', label: 'Comparison' },
  { href: '/digest', label: 'Digest' },
  { href: '/methodology', label: 'Methodology' },
  { href: '/about', label: 'About' },
]

function isActive(pathname: string | null, href: string): boolean {
  return pathname === href || (href !== '/' && (pathname?.startsWith(`${href}/`) ?? false))
}

export function Nav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/60">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-6 h-14">
        <Link href="/" className="flex items-center gap-2 shrink-0" onClick={() => setOpen(false)}>
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-zinc-100 font-mono text-sm font-bold tracking-tight">SILICON PULSE</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 ml-auto">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap',
                isActive(pathname, item.href)
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Mobile toggle */}
        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          className="md:hidden ml-auto inline-flex items-center justify-center h-9 w-9 rounded-md border border-zinc-800 text-zinc-300 hover:bg-zinc-800/50"
        >
          <div className="flex flex-col gap-1">
            <span className={clsx('h-px w-4 bg-current transition-transform', open && 'translate-y-[5px] rotate-45')} />
            <span className={clsx('h-px w-4 bg-current transition-opacity', open && 'opacity-0')} />
            <span className={clsx('h-px w-4 bg-current transition-transform', open && '-translate-y-[5px] -rotate-45')} />
          </div>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <nav className="md:hidden border-t border-zinc-800 bg-zinc-950 px-2 py-2">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={clsx(
                'block px-3 py-2 text-sm font-medium rounded-md transition-colors',
                isActive(pathname, item.href)
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}
