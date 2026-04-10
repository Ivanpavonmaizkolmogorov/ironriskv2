"use client";

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFeatureAccess, FeatureTier } from '@/store/useFeatureAccess';
import { Lock } from 'lucide-react';

interface PaywallGateProps {
  featureKey: string;
  fallbackType?: 'blur' | 'lock' | 'hidden';
  children: React.ReactNode;
}

const TIER_COLORS: Record<FeatureTier, string> = {
  free: 'border-green-500',
  pro: 'border-orange-500',
  enterprise: 'border-red-500'
};

const TIER_BG: Record<FeatureTier, string> = {
  free: 'bg-green-500/10 hover:bg-green-500/20',
  pro: 'bg-orange-500/10 hover:bg-orange-500/20',
  enterprise: 'bg-red-500/10 hover:bg-red-500/20'
};

export default function PaywallGate({ featureKey, fallbackType = 'blur', children }: PaywallGateProps) {
  const t = useTranslations();
  const { hasAccess, adminMode, features, updateFeatureTier } = useFeatureAccess();
  
  const [showPopover, setShowPopover] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const hasAuth = hasAccess(featureKey);
  const currentTier = features[featureKey] || 'free';

  // Handling Admin Mode interaction
  const handleTierChange = async (tier: FeatureTier) => {
    setIsUpdating(true);
    try {
      await updateFeatureTier(featureKey, tier);
      setShowPopover(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  };

  // If we are in Admin Mode, the container gets a colored border and is clickable
  if (adminMode) {
    return (
      <div 
        className={`relative group border-2 border-dashed ${TIER_COLORS[currentTier]} ${TIER_BG[currentTier]} transition-colors flex flex-col p-1 rounded-lg cursor-pointer min-h-[50px] w-full h-full`}
        onClick={(e) => {
          e.stopPropagation();
          setShowPopover(!showPopover);
        }}
      >
        {/* Admin Badge */}
        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-2 bg-neutral-900 border border-neutral-700 rounded-md shadow-lg text-xs font-mono font-bold px-2 py-0.5 z-20 flex gap-2 items-center">
          <span className="text-neutral-400">{featureKey}</span>
          <span className={`uppercase font-bold ${
            currentTier === 'free' ? 'text-green-400' :
            currentTier === 'pro' ? 'text-orange-400' : 'text-red-400'
          }`}>{currentTier}</span>
        </div>

        {/* The content itself - no blur in admin mode */}
        <div className="opacity-70 group-hover:opacity-50 transition-opacity pointer-events-none w-full h-full">
          {children}
        </div>

        {/* Editor Popover */}
        {showPopover && (
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-neutral-800 border border-neutral-700 shadow-2xl rounded-lg p-4 flex flex-col gap-3 min-w-[200px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-bold text-neutral-300 pb-2 border-b border-neutral-700 mb-1">
              {t('admin.changeTier')}
            </div>
            
            {(['free', 'pro', 'enterprise'] as FeatureTier[]).map(tier => (
              <label key={tier} className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer p-1 hover:bg-neutral-700 rounded">
                <input 
                  type="radio" 
                  name={`tier-${featureKey}`}
                  checked={currentTier === tier}
                  onChange={() => handleTierChange(tier)}
                  disabled={isUpdating}
                  className="accent-white cursor-pointer"
                />
                <span className={`uppercase font-bold ${
                  tier === 'free' ? 'text-green-500' :
                  tier === 'pro' ? 'text-orange-500' : 'text-red-500'
                }`}>{tier}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Normal User Flow
  if (hasAuth) {
    return <>{children}</>;
  }

  if (fallbackType === 'hidden') {
    return null;
  }

  return (
    <div className="relative overflow-hidden w-full h-full flex flex-col items-center justify-center rounded-xl bg-neutral-900/50 border border-neutral-800 p-8 text-center" style={{ minHeight: '150px' }}>
      
      {/* Blurred background content */}
      <div className="absolute inset-0 filter blur-md opacity-30 select-none pointer-events-none p-4 w-full flex items-center justify-center">
        {fallbackType === 'blur' ? children : (
          <div className="w-full h-full bg-neutral-800 rounded-lg"></div>
        )}
      </div>

      {/* Lock CTA overlay */}
      <div className="relative z-10 flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center">
          <Lock className="w-5 h-5 text-neutral-400" />
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-bold text-white">{t('paywall.upgradeRequired')}</h3>
          <p className="text-sm text-neutral-400 max-w-[250px]">{t('paywall.upgradeDesc')}</p>
        </div>
        <button 
          className="mt-3 px-6 py-2 bg-white text-black font-semibold rounded-md hover:bg-neutral-200 transition-colors cursor-not-allowed"
          title="Próximamente"
        >
          {t('paywall.btnUpgrade')}
        </button>
      </div>
    </div>
  );
}
