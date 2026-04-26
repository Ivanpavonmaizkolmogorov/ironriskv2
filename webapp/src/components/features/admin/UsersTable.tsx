"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { adminAPI } from "@/services/api";
import { Trash2, Shield, User, Clock, Briefcase, Activity, Key, Eye } from "lucide-react";
import Button from "@/components/ui/Button";
import { useAuthStore } from "@/store/useAuthStore";

interface AdminUser {
  id: string;
  email: string;
  is_admin: boolean;
  created_at: string;
  trading_accounts_count: number;
  strategies_count: number;
}

export default function UsersTable() {
  const t = useTranslations("admin");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const currentUser = useAuthStore(state => state.user);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await adminAPI.listUsers();
      setUsers(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDeleteUser = async (userId: string) => {
    try {
      await adminAPI.deleteUser(userId);
      setDeleteConfirm(null);
      await fetchUsers(); // refresh the list
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to delete user");
    }
  };

  const handleToggleAdmin = async (userId: string, currentStatus: boolean) => {
    try {
      await adminAPI.updateUser(userId, { is_admin: !currentStatus });
      await fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to update user");
    }
  };

  const handleResetPassword = async (userId: string) => {
    const newPassword = prompt("Introduce la nueva contraseña para este usuario:");
    if (!newPassword || newPassword.trim() === "") return;
    try {
      await adminAPI.updateUser(userId, { password: newPassword });
      alert("Contraseña restablecida correctamente.");
    } catch (err: any) {
      alert(err.response?.data?.detail || "Error al actualizar la contraseña");
    }
  };

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center p-12 bg-surface-primary border border-iron-800/40 rounded-2xl animate-pulse">
        <span className="text-iron-500 font-mono tracking-widest uppercase">Loading Database Core...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/20 text-red-500 border border-red-500/50 rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-6 bg-surface-secondary border border-iron-800/50 rounded-2xl shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <User className="text-iron-400 w-5 h-5" />
            <h3 className="text-sm font-semibold text-iron-400">Total Users</h3>
          </div>
          <div className="text-4xl font-bold tracking-tight text-iron-100">{users.length}</div>
        </div>
        <div className="p-6 bg-surface-secondary border border-iron-800/50 rounded-2xl shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <Briefcase className="text-iron-400 w-5 h-5" />
            <h3 className="text-sm font-semibold text-iron-400">Total Workspaces</h3>
          </div>
          <div className="text-4xl font-bold tracking-tight text-iron-100">
            {users.reduce((acc, u) => acc + u.trading_accounts_count, 0)}
          </div>
        </div>
        <div className="p-6 bg-surface-secondary border border-iron-800/50 rounded-2xl shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="text-iron-400 w-5 h-5" />
            <h3 className="text-sm font-semibold text-iron-400">Total Strategies</h3>
          </div>
          <div className="text-4xl font-bold tracking-tight text-iron-100">
            {users.reduce((acc, u) => acc + u.strategies_count, 0)}
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-hidden bg-surface-secondary border border-iron-800/50 rounded-2xl shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-surface-primary/80 text-iron-400 uppercase text-xs font-semibold tracking-wider">
              <tr>
                <th className="px-6 py-4">User Email</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Metadatos</th>
                <th className="px-6 py-4">Created At</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-iron-800/40">
              {users.map((u) => {
                const isMe = currentUser?.id === u.id;
                return (
                  <tr key={u.id} className="hover:bg-iron-800/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${u.is_admin ? 'bg-risk-green/20 text-risk-green' : 'bg-iron-800 text-iron-300'}`}>
                          {u.is_admin ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                        </div>
                        <div className="flex flex-col">
                          <span className={`font-semibold ${isMe ? 'text-iron-100' : 'text-iron-200'}`}>
                            {u.email} {isMe && "(You)"}
                          </span>
                          <span className="text-xs text-iron-500 font-mono truncate w-32">{u.id}</span>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => handleToggleAdmin(u.id, u.is_admin)}
                        disabled={isMe}
                        className={`px-3 py-1 rounded-full text-xs font-bold border ${u.is_admin ? 'bg-risk-green/10 text-risk-green border-risk-green/50' : 'bg-iron-900 border-iron-700 text-iron-400'} ${!isMe ? 'hover:scale-105 transition-transform' : 'opacity-50 cursor-not-allowed'}`}
                      >
                        {u.is_admin ? "ADMIN" : "USER"}
                      </button>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4 text-xs font-medium text-iron-300">
                        <span className="flex items-center gap-1 bg-surface-primary px-2 py-1 rounded-md border border-iron-800/50">
                          <Briefcase className="w-3 h-3 text-iron-500" /> {u.trading_accounts_count} Workspaces
                        </span>
                        <span className="flex items-center gap-1 bg-surface-primary px-2 py-1 rounded-md border border-iron-800/50">
                          <Activity className="w-3 h-3 text-iron-500" /> {u.strategies_count} Strats
                        </span>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 text-iron-400 text-sm">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        {new Date(u.created_at).toLocaleDateString()}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-right">
                      {deleteConfirm === u.id ? (
                        <div className="flex items-center justify-end gap-2 animate-in fade-in slide-in-from-right-4">
                          <span className="text-xs text-red-500 font-bold mr-2 uppercase tracking-wide">Are you sure?</span>
                          <button 
                            onClick={() => handleDeleteUser(u.id)}
                            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded text-xs font-bold transition-colors"
                          >
                            Yes, Purge
                          </button>
                          <button 
                            onClick={() => setDeleteConfirm(null)}
                            className="bg-iron-800 hover:bg-iron-700 text-iron-200 px-3 py-1.5 rounded text-xs transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button 
                            onClick={() => {
                              const impersonate = useAuthStore.getState().impersonate;
                              impersonate(u.id);
                            }}
                            disabled={isMe}
                            className={`p-2 rounded-lg text-iron-500 border border-transparent ${!isMe ? 'hover:bg-[#00aaff]/10 hover:text-[#00aaff] hover:border-[#00aaff]/30' : 'opacity-30 cursor-not-allowed'} transition-all`}
                            title={isMe ? "Cannot impersonate yourself" : `View as ${u.email}`}
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => handleResetPassword(u.id)}
                            className="p-2 rounded-lg text-iron-500 border border-transparent hover:bg-risk-yellow/10 hover:text-risk-yellow hover:border-risk-yellow/30 transition-all"
                            title="Reset Password"
                          >
                            <Key className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => setDeleteConfirm(u.id)}
                            disabled={isMe}
                            className={`p-2 rounded-lg text-iron-500 border border-transparent ${!isMe ? 'hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30' : 'opacity-30 cursor-not-allowed'} transition-all`}
                            title={isMe ? "Cannot delete yourself" : "Delete User"}
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="w-full text-center py-12 text-iron-500 font-medium">
              No users found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
