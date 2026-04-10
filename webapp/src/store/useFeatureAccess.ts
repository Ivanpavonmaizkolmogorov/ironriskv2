import { create } from 'zustand';
import api from '@/services/api';

export type FeatureTier = 'free' | 'pro' | 'enterprise';

interface FeatureState {
  // Global feature config from backend
  features: Record<string, FeatureTier>;
  
  // Current user's tier
  userTier: FeatureTier;
  isAdmin: boolean;
  adminMode: boolean;

  // Actions
  toggleAdminMode: () => void;
  setAdminStatus: (isAdmin: boolean) => void;
  setUserTier: (tier: FeatureTier) => void;
  loadFeatures: () => Promise<void>;
  updateFeatureTier: (key: string, tier: FeatureTier) => Promise<void>;
  
  // Utility
  hasAccess: (featureKey: string) => boolean;
}

const TIER_LEVELS = {
  free: 1,
  pro: 2,
  enterprise: 3
};

export const useFeatureAccess = create<FeatureState>((set, get) => ({
  features: {},
  userTier: 'free',
  isAdmin: false,
  adminMode: false,

  toggleAdminMode: () => set((state) => ({ adminMode: !state.adminMode })),
  
  setAdminStatus: (isAdmin) => set({ isAdmin }),
  
  setUserTier: (tier) => set({ userTier: tier }),

  loadFeatures: async () => {
    try {
      // Endpoint is open to GET for all users
      const { data } = await api.get('/api/admin/features');
      set({ features: data });
    } catch (error) {
      console.error('Failed to load feature flags', error);
    }
  },

  updateFeatureTier: async (key: string, tier: FeatureTier) => {
    try {
      await api.patch(`/api/admin/features/${key}`, { tier });
      set((state) => ({
        features: {
          ...state.features,
          [key]: tier
        }
      }));
    } catch (error) {
      console.error('Failed to update feature flag', error);
      throw error;
    }
  },

  hasAccess: (featureKey: string) => {
    const { features, userTier, isAdmin } = get();
    
    // Admins always have access
    if (isAdmin) return true;

    // If feature not registered, default to free
    const requiredTier = features[featureKey] || 'free';
    
    return TIER_LEVELS[userTier] >= TIER_LEVELS[requiredTier];
  }
}));
