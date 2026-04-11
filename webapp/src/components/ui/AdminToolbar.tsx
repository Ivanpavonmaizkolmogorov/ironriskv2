"use client";

import React, { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { useFeatureAccess } from '@/store/useFeatureAccess';
import { useAuthStore } from '@/store/useAuthStore';
import { Settings, Users } from 'lucide-react';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function AdminToolbar() {
  const t = useTranslations('admin');
  const locale = useLocale();
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuthStore();
  const { isAdmin, adminMode, toggleAdminMode, loadFeatures, setAdminStatus } = useFeatureAccess();

  const [mounted, setMounted] = useState(false);
  const [apiVersion, setApiVersion] = useState<string | null>(null);

  // Fix Next.js hydration mismatch for Zustand stores
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch API version on mount
  useEffect(() => {
    if (!mounted || !isAdmin) return;
    fetch(`${API_BASE}/`)
      .then(r => r.json())
      .then(d => setApiVersion(d.version || '?'))
      .catch(() => setApiVersion('err'));
  }, [mounted, isAdmin]);

  // Sync auth state with feature access admin status
  useEffect(() => {
    if (isAuthenticated && user) {
      setAdminStatus(
        user.is_admin === true || 
        Number(user.is_admin) === 1 ||
        user.email === 'ivanpavonmaiz@gmail.com'
      );
    } else {
      setAdminStatus(false);
    }
  }, [isAuthenticated, user, setAdminStatus]);

  // Load features once on mount if admin
  useEffect(() => {
    if (isAdmin) {
      loadFeatures();
    }
  }, [isAdmin, loadFeatures]);

  // Only show the Admin Toolbar in protected core app areas.
  const isCoreAppRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/admin');
  
  if (!mounted || !isAdmin || !isCoreAppRoute) return null;

  return (
    <div className="fixed bottom-6 left-6 z-50 flex flex-col items-start gap-3 animate-in fade-in slide-in-from-bottom-4">
      {adminMode && (
        <Link 
          href={`/${locale}/admin/users`} 
          className="flex items-center gap-2 px-5 py-2.5 rounded-full shadow-2xl font-mono font-bold text-sm transition-all bg-surface-secondary text-iron-100 border border-iron-600 hover:text-white hover:border-risk-green hover:shadow-[0_0_15px_rgba(0,230,118,0.2)]"
        >
          <Users className="w-4 h-4 text-risk-green" /> Manage Users
        </Link>
      )}
      
      <div className="flex items-center gap-2">
        <button
          onClick={toggleAdminMode}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-full shadow-2xl font-mono font-bold text-sm transition-all ${
            adminMode 
              ? 'bg-red-500/90 text-white hover:bg-red-500 border border-red-400 hover:scale-105' 
              : 'bg-surface-elevated text-iron-300 hover:text-white border border-iron-700 hover:border-iron-500'
          }`}
        >
          <Settings className={`w-4 h-4 ${adminMode ? 'animate-spin-slow' : ''}`} />
          {adminMode ? t('modeOn') : t('modeOff')}
        </button>

        {apiVersion && (
          <span className="px-2.5 py-1 rounded-full bg-surface-elevated/80 border border-iron-700 font-mono text-[10px] text-iron-400 select-all" title="API deploy version (git SHA)">
            API: {apiVersion}
          </span>
        )}
      </div>
    </div>
  );
}
