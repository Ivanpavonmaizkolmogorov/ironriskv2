"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/useAuthStore";
import { useTranslations } from "next-intl";
import UsersTable from "@/components/features/admin/UsersTable";
import LeadsTable from "@/components/features/admin/LeadsTable";
import { ArrowLeft } from "lucide-react";
import BetaInviteButton from "@/components/features/admin/BetaInviteButton";
import SystemSettingsPanel from "@/components/features/admin/SystemSettingsPanel";

export default function AdminUsersPage() {
  const t = useTranslations("admin");
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    // RBAC: Redirect to login if not authenticated, or to dashboard if not admin
    if (!isAuthenticated) {
      router.replace("/login");
    } else if (user && !user.is_admin) {
      router.replace("/dashboard");
    }
  }, [mounted, isAuthenticated, user, router]);

  // Don't render until mounted and auth checks pass
  if (!mounted || !isAuthenticated || !user || !user.is_admin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-surface-primary flex flex-col">
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-12 flex flex-col gap-10">
        
        <Link 
          href="/dashboard"
          className="flex items-center gap-2 text-sm text-iron-500 hover:text-iron-300 w-fit transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>

        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-iron-100 tracking-tight">Admin Console</h1>
            <span className="bg-risk-green/20 text-risk-green text-xs font-bold px-3 py-1 rounded-full border border-risk-green/50 uppercase tracking-widest">
              Live Database
            </span>
          </div>
          <p className="text-iron-400 text-sm max-w-2xl">
            {t('adminWarning') || "Warning: Actions performed here execute raw SQLAlchemy cascade deletions. Proceed with extreme caution. Deleted workspaces and strategies cannot be recovered."}
          </p>
          <BetaInviteButton />
        </header>

        <section className="w-full">
          <SystemSettingsPanel />
        </section>

        <section className="w-full">
          <UsersTable />
        </section>

        <section className="w-full">
          <LeadsTable />
        </section>
      </main>
    </div>
  );
}
