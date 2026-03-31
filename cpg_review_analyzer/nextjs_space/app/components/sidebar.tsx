'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Package, AlertTriangle, BarChart3, Settings, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const navItems = [
  { href: '/', label: 'Products', icon: Package },
  { href: '/triage', label: 'Triage', icon: AlertTriangle },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname() ?? '/';
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-lg text-sky-600">CPG Analyzer</span>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 rounded-lg hover:bg-gray-100">
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 z-40 bg-black/30"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full z-50 w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0`}>
        <div className="p-6 border-b border-gray-100">
          <h1 className="text-xl font-bold text-sky-600 flex items-center gap-2">
            <BarChart3 size={24} />
            CPG Analyzer
          </h1>
          <p className="text-xs text-gray-400 mt-1">Product Review Intelligence</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems?.map?.((item: any) => {
            const isActive = pathname === item?.href || (item?.href !== '/' && pathname?.startsWith?.(item?.href)) || (item?.href === '/' && pathname?.startsWith?.('/products'));
            return (
              <Link
                key={item?.href}
                href={item?.href ?? '/'}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-sky-50 text-sky-700 shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <item.icon size={18} className={isActive ? 'text-sky-600' : 'text-gray-400'} />
                {item?.label}
              </Link>
            );
          }) ?? []}
        </nav>
        <div className="p-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">Review Analyzer v1.0</p>
        </div>
      </aside>

      {/* Mobile top spacer */}
      <div className="lg:hidden h-14" />
    </>
  );
}
