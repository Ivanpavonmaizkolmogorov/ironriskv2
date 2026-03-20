import Link from "next/link";
import React from "react";

export default function ThankYouPage() {
  return (
    <main className="min-h-screen bg-surface-primary flex flex-col items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-6 bg-surface-secondary border border-iron-800 rounded-2xl p-8 shadow-2xl animate-in fade-in zoom-in duration-500">
        <div className="w-16 h-16 bg-risk-green/20 outline outline-1 outline-risk-green/40 shadow-[0_0_30px_rgba(0,230,118,0.2)] text-risk-green rounded-full flex items-center justify-center mx-auto text-3xl mb-4">
          ✓
        </div>
        <h1 className="text-3xl font-bold text-iron-50 tracking-tight">
          You&apos;re on the list!
        </h1>
        <p className="text-iron-400 text-lg leading-relaxed">
          Thank you for joining the IronRisk waitlist. We&apos;ll notify you via email as soon as Closed Beta spots become available.
        </p>
        
        <div className="pt-8 mt-2 border-t border-iron-800">
          <Link
            href="/"
            className="inline-block w-full bg-surface-tertiary text-iron-200 border border-iron-700 hover:bg-iron-800 hover:text-iron-50 hover:border-iron-500 rounded-xl px-6 py-3 font-medium transition-all duration-200"
          >
            Return Home
          </Link>
        </div>
      </div>
    </main>
  );
}
