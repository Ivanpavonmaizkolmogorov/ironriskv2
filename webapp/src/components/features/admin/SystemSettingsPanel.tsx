"use client";

import React, { useState, useEffect } from "react";
import { settingsAPI } from "@/services/api";
import { useSettingsStore } from "@/store/useSettingsStore";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Save, AlertCircle } from "lucide-react";

export default function SystemSettingsPanel() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const { fetchSettings } = useSettingsStore();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await settingsAPI.get("admin_telegram_handle");
      setHandle(res.data.value);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    try {
      await settingsAPI.update("admin_telegram_handle", handle, "Support Telegram alias");
      setSuccess(true);
      // Update global store so the UI updates immediately
      fetchSettings();
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface-secondary border border-iron-800 rounded-xl overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="px-6 py-4 border-b border-iron-800 bg-surface-tertiary flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-iron-200">System Configurations</h2>
          <p className="text-xs text-iron-500 mt-1">Global settings affecting all public pages and CTAs.</p>
        </div>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="text-sm text-iron-500 animate-pulse">Loading settings...</div>
        ) : (
          <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-lg">
            
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-iron-300">
                Support Telegram Handle
              </label>
              <div className="flex gap-3 items-start">
                <div className="flex-1">
                  <Input 
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="@IronRisk_Ivan"
                    required
                  />
                  <div className="text-xs text-iron-500 mt-2 flex gap-1.5 items-start">
                    <AlertCircle className="w-4 h-4 shrink-0 text-risk-blue" />
                    <span>This updates the QR codes and links in the Simulator, Register page, and Bug Reporter across the entire application instantly.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Button type="submit" isLoading={saving} className="bg-risk-blue hover:bg-risk-blue/80 text-white border-none flex gap-2">
                <Save className="w-4 h-4" /> Save Configuration
              </Button>
              {success && <span className="text-xs text-risk-green font-medium animate-in fade-in zoom-in">Saved successfully!</span>}
            </div>

          </form>
        )}
      </div>
    </div>
  );
}
