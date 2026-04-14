"use client";

import React, { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { useFeatureAccess } from '@/store/useFeatureAccess';
import { useAuthStore } from '@/store/useAuthStore';
import { Settings, Users, HeartPulse, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';

let API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
if (typeof window !== "undefined" && window.location.protocol === "https:" && API_BASE.startsWith("http://")) {
  API_BASE = API_BASE.replace("http://", "https://");
}

export default function AdminToolbar() {
  const t = useTranslations('admin');
  const locale = useLocale();
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuthStore();
  const { isAdmin, adminMode, toggleAdminMode, loadFeatures, setAdminStatus } = useFeatureAccess();

  const [mounted, setMounted] = useState(false);
  const [apiVersion, setApiVersion] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

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

  const handleTestUptime = async () => {
    setHealthStatus('loading');
    try {
      const res = await fetch(`${API_BASE}/api/admin/test-uptime`, {
        method: 'POST',
        headers: {
        'Authorization': `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('ironrisk_jwt') : ''}`,
          'Content-Type': 'application/json',
        },
      });
      if (res.ok) {
        setHealthStatus('ok');
      } else {
        setHealthStatus('error');
      }
    } catch {
      setHealthStatus('error');
    }
    // Reset after 5 seconds
    setTimeout(() => setHealthStatus('idle'), 5000);
  };

  // Only show the Admin Toolbar in protected core app areas.
  const isCoreAppRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/admin');
  
  if (!mounted || !isAdmin || !isCoreAppRoute) return null;

  return (
    <div className="fixed bottom-6 left-6 z-50 flex flex-col items-start gap-3 animate-in fade-in slide-in-from-bottom-4">
      {adminMode && (
        <>
          <Link 
            href={`/${locale}/admin/users`} 
            className="flex items-center gap-2 px-5 py-2.5 rounded-full shadow-2xl font-mono font-bold text-sm transition-all bg-surface-secondary text-iron-100 border border-iron-600 hover:text-white hover:border-risk-green hover:shadow-[0_0_15px_rgba(0,230,118,0.2)]"
          >
            <Users className="w-4 h-4 text-risk-green" /> Manage Users
          </Link>
          <button
            onClick={handleTestUptime}
            disabled={healthStatus === 'loading'}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full shadow-2xl font-mono font-bold text-sm transition-all border ${
              healthStatus === 'ok'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
                : healthStatus === 'error'
                ? 'bg-red-500/20 text-red-400 border-red-500/50'
                : 'bg-surface-secondary text-iron-100 border-iron-600 hover:text-white hover:border-cyan-400 hover:shadow-[0_0_15px_rgba(0,200,255,0.2)]'
            }`}
          >
            {healthStatus === 'loading' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Comprobando...</>
            ) : healthStatus === 'ok' ? (
              <><CheckCircle2 className="w-4 h-4" /> ✅ Email enviado</>
            ) : healthStatus === 'error' ? (
              <><XCircle className="w-4 h-4" /> ❌ Error</>
            ) : (
              <><HeartPulse className="w-4 h-4 text-cyan-400" /> Test Server</>
            )}
          </button>
        </>
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
          <span className="px-4 py-2 rounded-full bg-surface-elevated border border-risk-green/40 font-mono text-sm font-bold text-risk-green shadow-lg shadow-risk-green/10 select-all" title="Versión desplegada en Hetzner">
            🚀 {apiVersion}
          </span>
        )}
      </div>
    </div>
  );
}
