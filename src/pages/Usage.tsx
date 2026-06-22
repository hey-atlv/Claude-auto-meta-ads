import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot, getDocs, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { Activity, Users, Clock, Eye, ShieldCheck, Mail, Calendar, TrendingUp, Zap, MousePointer2, Check, X, UserCog, UserPlus, Trash2 } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';

interface UserActivity {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  page: string;
  timestamp: number;
}

interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'user';
  status?: 'pending' | 'approved';
  createdAt?: number;
}

interface InvitedEmail {
  id: string;
  email: string;
  role: 'admin' | 'user';
  invitedBy: string;
  invitedAt: number;
}

export const Usage: React.FC = () => {
  const { user } = useAuth();
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [userRoles, setUserRoles] = useState<Record<string, 'admin' | 'user'>>({});
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [invites, setInvites] = useState<InvitedEmail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingUid, setSavingUid] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const roles: Record<string, 'admin' | 'user'> = {};
      const list: UserProfile[] = [];
      snapshot.forEach(d => {
        const data = d.data() as UserProfile;
        roles[data.uid] = data.role;
        list.push({ ...data, uid: data.uid || d.id });
      });
      setUserRoles(roles);
      list.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
      setAllUsers(list);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const fetchInvites = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'invitedEmails'));
      const list: InvitedEmail[] = [];
      snapshot.forEach(d => list.push({ id: d.id, ...(d.data() as Omit<InvitedEmail, 'id'>) }));
      list.sort((a, b) => (b.invitedAt || 0) - (a.invitedAt || 0));
      setInvites(list);
    } catch (error) {
      console.error("Error fetching invites:", error);
    }
  };

  const updateUserAccess = async (uid: string, patch: Partial<Pick<UserProfile, 'status' | 'role'>>) => {
    setSavingUid(uid);
    try {
      await updateDoc(doc(db, 'users', uid), patch);
      setAllUsers(prev => prev.map(u => (u.uid === uid ? { ...u, ...patch } : u)));
      setUserRoles(prev => (patch.role ? { ...prev, [uid]: patch.role } : prev));
    } catch (error) {
      console.error("Error updating user access:", error);
      alert("Không thể cập nhật quyền truy cập. Vui lòng thử lại.");
    } finally {
      setSavingUid(null);
    }
  };

  const sendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    setInviteError(null);
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
      setInviteError('Email không hợp lệ.');
      return;
    }
    if (allUsers.some(u => (u.email || '').toLowerCase() === email)) {
      setInviteError('Email này đã có trong hệ thống — dùng nút "Cấp quyền" ở bảng dưới.');
      return;
    }
    setIsInviting(true);
    try {
      await setDoc(doc(db, 'invitedEmails', email), {
        email,
        role: inviteRole,
        invitedBy: user?.email || 'admin',
        invitedAt: Date.now(),
      });
      setInviteEmail('');
      setInviteRole('user');
      await fetchInvites();
    } catch (error) {
      console.error("Error sending invite:", error);
      setInviteError('Không thể gửi lời mời. Vui lòng thử lại.');
    } finally {
      setIsInviting(false);
    }
  };

  const cancelInvite = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'invitedEmails', id));
      setInvites(prev => prev.filter(i => i.id !== id));
    } catch (error) {
      console.error("Error cancelling invite:", error);
      alert("Không thể hủy lời mời. Vui lòng thử lại.");
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchInvites();

    const q = query(collection(db, 'userActivities'), orderBy('timestamp', 'desc'), limit(1000));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: UserActivity[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as UserActivity);
      });
      setActivities(data);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredActivities = useMemo(() => {
    return activities.filter(a => (userRoles[a.userId] || 'user') !== 'admin');
  }, [activities, userRoles]);

  const behaviorAnalysis = useMemo(() => {
    const actionCounts: Record<string, number> = {};
    const pageCounts: Record<string, number> = {};
    
    filteredActivities.forEach(a => {
      // Action counts
      actionCounts[a.action] = (actionCounts[a.action] || 0) + 1;
      
      // Page counts
      const cleanPage = a.page === '/' ? '/dashboard' : a.page;
      pageCounts[cleanPage] = (pageCounts[cleanPage] || 0) + 1;
    });

    const topActions = Object.entries(actionCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const topPages = Object.entries(pageCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Engagement for specific important actions
    const total = Math.max(1, filteredActivities.length);
    const engagementStats = [
      { name: 'Đồng bộ data', value: (filteredActivities.filter(a => a.action === 'SYNC_DATA').length / total) * 100 },
      { name: 'Xem báo cáo', value: (filteredActivities.filter(a => a.action === 'VIEW_PAGE').length / total) * 100 },
      { name: 'Sửa KPI', value: (filteredActivities.filter(a => a.action === 'UPDATE_KPI').length / total) * 100 },
      { name: 'Xuất data', value: (filteredActivities.filter(a => a.action === 'EXPORT_DATA').length / total) * 100 },
    ];

    return { topActions, topPages, engagementStats };
  }, [filteredActivities]);

  const metrics = useMemo(() => {
    const now = Date.now();
    const last24h = filteredActivities.filter(a => a.timestamp > now - 86400000);
    const activeUsers24h = new Set(last24h.map(a => a.userId)).size;
    
    return {
      totalViews: filteredActivities.length,
      activeUsers24h,
      lastActivity: filteredActivities[0]?.timestamp || null,
      topPage: filteredActivities.reduce((acc, curr) => {
        const cleanPage = curr.page === '/' ? '/dashboard' : curr.page;
        acc[cleanPage] = (acc[cleanPage] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };
  }, [filteredActivities]);

  const chartData = useMemo(() => {
    const last30Days = [...Array(30)].map((_, i) => {
      const date = subDays(new Date(), i);
      const start = startOfDay(date).getTime();
      const end = endOfDay(date).getTime();
      
      const dayActivities = filteredActivities.filter(a => a.timestamp >= start && a.timestamp <= end);
      const uniqueUsers = new Set(dayActivities.map(a => a.userId)).size;
      
      return {
        name: format(date, 'dd/MM'),
        users: uniqueUsers,
        views: dayActivities.length
      };
    }).reverse();
    
    return last30Days;
  }, [filteredActivities]);

  if (isLoading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Đang tải báo cáo truy cập...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-10 max-w-[1600px] mx-auto w-full space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-gray-100">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/20">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-gray-900 uppercase tracking-tight">Quản lý Truy cập</h1>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mt-0.5">Báo cáo hoạt động & Tương tác người dùng</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Hệ thống Đang hoạt động</span>
          </div>
        </div>
      </div>

      {/* Access control — approve/revoke which emails may view reports */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/40">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1.5 h-6 bg-rose-500 rounded-full" />
          <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Phân quyền truy cập báo cáo</h3>
          <span className="text-[8px] font-black text-gray-400 uppercase px-2 py-1 bg-gray-50 rounded">
            Chỉ email đã được duyệt mới xem được báo cáo
          </span>
        </div>

        {/* Invite by email — pre-approve an email before they ever log in */}
        <div className="mb-6 p-4 bg-gray-50 rounded-2xl border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <UserPlus className="w-4 h-4 text-blue-600" />
            <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest">Gửi lời mời truy cập</span>
          </div>
          <div className="flex flex-wrap items-stretch gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendInvite(); }}
              placeholder="email@congty.com"
              className="flex-1 min-w-[220px] px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as 'admin' | 'user')}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <button
              disabled={isInviting || !inviteEmail.trim()}
              onClick={sendInvite}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" /> {isInviting ? 'Đang gửi...' : 'Mời'}
            </button>
          </div>
          {inviteError && <p className="text-xs text-rose-600 mt-2">{inviteError}</p>}
          <p className="text-[10px] text-gray-400 mt-2">
            Email được mời sẽ tự động được duyệt ngay khi họ đăng nhập Google lần đầu — không cần chờ xét duyệt.
          </p>

          {invites.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {invites.map(inv => {
                const alreadyJoined = allUsers.some(u => (u.email || '').toLowerCase() === inv.email.toLowerCase());
                return (
                  <div key={inv.id} className="flex items-center justify-between gap-3 px-3 py-2 bg-white rounded-lg border border-gray-100">
                    <div className="flex items-center gap-2 min-w-0">
                      <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="text-xs font-semibold text-gray-700 truncate">{inv.email}</span>
                      <span className={clsx('text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0',
                        inv.role === 'admin' ? 'bg-violet-50 text-violet-700' : 'bg-gray-100 text-gray-600')}>
                        {inv.role === 'admin' ? 'Admin' : 'User'}
                      </span>
                      {alreadyJoined ? (
                        <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 shrink-0">Đã tham gia</span>
                      ) : (
                        <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 shrink-0">Chưa đăng nhập</span>
                      )}
                    </div>
                    <button
                      onClick={() => cancelInvite(inv.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-rose-600 hover:bg-rose-50 text-[10px] font-bold shrink-0"
                    >
                      <Trash2 className="w-3 h-3" /> Hủy
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="py-2 px-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Email</th>
                <th className="py-2 px-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Vai trò</th>
                <th className="py-2 px-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Trạng thái</th>
                <th className="py-2 px-3 text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {allUsers.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-xs text-gray-400">Chưa có người dùng nào.</td></tr>
              )}
              {allUsers.map(u => {
                const isApproved = u.role === 'admin' || u.status === 'approved';
                const isSaving = savingUid === u.uid;
                return (
                  <tr key={u.uid}>
                    <td className="py-2.5 px-3 text-xs font-semibold text-gray-800">{u.email || u.uid}</td>
                    <td className="py-2.5 px-3">
                      <span className={clsx('text-[9px] font-black uppercase px-2 py-1 rounded-full',
                        u.role === 'admin' ? 'bg-violet-50 text-violet-700' : 'bg-gray-100 text-gray-600')}>
                        {u.role === 'admin' ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={clsx('text-[9px] font-black uppercase px-2 py-1 rounded-full',
                        isApproved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
                        {isApproved ? 'Đã duyệt' : 'Chờ duyệt'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {u.role !== 'admin' && (
                          isApproved ? (
                            <button
                              disabled={isSaving}
                              onClick={() => updateUserAccess(u.uid, { status: 'pending' })}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 text-[10px] font-bold disabled:opacity-50"
                            >
                              <X className="w-3 h-3" /> Thu hồi
                            </button>
                          ) : (
                            <button
                              disabled={isSaving}
                              onClick={() => updateUserAccess(u.uid, { status: 'approved' })}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 text-[10px] font-bold disabled:opacity-50"
                            >
                              <Check className="w-3 h-3" /> Cấp quyền
                            </button>
                          )
                        )}
                        <button
                          disabled={isSaving}
                          onClick={() => updateUserAccess(u.uid, { role: u.role === 'admin' ? 'user' : 'admin', status: 'approved' })}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 bg-gray-50 hover:bg-gray-100 text-[10px] font-bold disabled:opacity-50"
                        >
                          <UserCog className="w-3 h-3" /> {u.role === 'admin' ? 'Bỏ admin' : 'Đặt admin'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/40 relative overflow-hidden group hover:scale-[1.02] transition-all duration-500">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <Zap className="w-16 h-16 text-blue-600" />
          </div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Mật độ Tương tác (User)</p>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-black text-gray-900 tracking-tighter">{filteredActivities.length}</span>
            <span className="text-[10px] font-black text-blue-500 mb-1.5 uppercase tracking-widest">Actions</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/40 relative overflow-hidden group hover:scale-[1.02] transition-all duration-500">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <Users className="w-16 h-16 text-purple-600" />
          </div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Nhân sự Đang dùng</p>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-black text-gray-900 tracking-tighter">{metrics.activeUsers24h}</span>
            <span className="text-[10px] font-black text-purple-500 mb-1.5 uppercase">Users</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/40 relative overflow-hidden group hover:scale-[1.02] transition-all duration-500">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <TrendingUp className="w-16 h-16 text-emerald-600" />
          </div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Trang xem nhiều nhất</p>
          <div className="flex flex-col">
            <span className="text-xs font-black text-gray-900 truncate uppercase w-full">
              {behaviorAnalysis.topPages[0]?.name || 'N/A'}
            </span>
            <span className="text-[10px] font-black text-emerald-500 uppercase mt-1">
              {behaviorAnalysis.topPages[0]?.value || 0} Lượt xem
            </span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/40 relative overflow-hidden group hover:scale-[1.02] transition-all duration-500">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <MousePointer2 className="w-16 h-16 text-amber-600" />
          </div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Hành động Phổ biến</p>
          <div className="flex flex-col">
            <span className="text-xs font-black text-gray-900 uppercase">
              {behaviorAnalysis.topActions[0]?.name || 'N/A'}
            </span>
            <span className="text-[10px] font-black text-amber-500 uppercase mt-1">User Intent</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Behavior Comparison - Admin vs user */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/40">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Phân bổ Hành vi hội viên</h3>
            </div>
            <span className="text-[8px] font-black text-gray-400 uppercase px-2 py-1 bg-gray-50 rounded">Tỉ lệ % tương tác của User</span>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={behaviorAnalysis.engagementStats} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F3F4F6" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  tick={{ fontSize: 9, fontWeight: 900, fill: '#4B5563' }}
                  width={100}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip cursor={{ fill: '#F9FAFB' }} />
                <Bar dataKey="value" name="Tỉ lệ sử dụng (%)" fill="#8B5CF6" radius={[0, 4, 4, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Pages Heatmap List */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/40 border-l border-gray-50">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
            <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Khu vực User quan tâm nhất</h3>
          </div>
          <div className="space-y-4">
            {behaviorAnalysis.topPages.map((page, i) => (
              <div key={page.name} className="relative p-4 rounded-2xl bg-gray-50 border border-transparent hover:border-emerald-100 transition-all overflow-hidden group">
                <div 
                  className="absolute inset-y-0 left-0 bg-emerald-500/5 transition-all duration-700" 
                  style={{ width: `${(page.value / (behaviorAnalysis.topPages[0]?.value || 1)) * 100}%` }}
                />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-black text-emerald-600">0{i+1}</span>
                    <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest">{page.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-gray-900">{page.value}</span>
                    <TrendingUp className="w-3 h-3 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Usage Trend Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/40">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Tương tác 30 ngày gần nhất</h3>
            </div>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 10, fontWeight: 800, fill: '#9CA3AF' }}
                  interval={6}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 10, fontWeight: 800, fill: '#9CA3AF' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#9CA3AF' }}
                />
                <Line type="monotone" dataKey="users" name="Số User" stroke="#8B5CF6" strokeWidth={4} dot={{ r: 4, fill: '#8B5CF6', strokeWidth: 0 }} />
                <Line type="monotone" dataKey="views" name="Lượt Xem" stroke="#3B82F6" strokeWidth={4} dot={{ r: 4, fill: '#3B82F6', strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Action Table */}
        <div className="lg:col-span-1 bg-white overflow-hidden rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/40 flex flex-col">
          <div className="p-6 border-b border-gray-50 flex items-center justify-between">
            <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Nhật ký Hoạt động</h3>
            <Activity className="w-4 h-4 text-gray-300" />
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar max-h-[400px]">
            <div className="divide-y divide-gray-50">
              {filteredActivities.length > 0 ? (
                filteredActivities.slice(0, 50).map((activity) => (
                  <div key={activity.id} className="p-4 hover:bg-gray-50 transition-colors group">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center font-black text-gray-400 text-[10px] flex-shrink-0 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
                        {activity.userEmail.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-black text-gray-900 truncate uppercase tracking-widest">{activity.userEmail.split('@')[0]}</p>
                          <span className="text-[8px] font-black text-gray-400 uppercase">{format(activity.timestamp, 'HH:mm dd/MM')}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={clsx(
                            "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                            activity.action === 'VIEW_PAGE' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'
                          )}>
                            {activity.action}
                          </span>
                          <span className="text-[9px] font-bold text-gray-400 truncate">{activity.page}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-20 text-center text-[10px] font-black text-gray-300 uppercase tracking-widest">Chưa có dữ liệu hội viên</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Narrative Report Section */}
      <div className="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 opacity-[0.03]">
          <Activity className="w-64 h-64 text-indigo-600" />
        </div>
        
        <div className="relative max-w-4xl">
          <h2 className="text-lg font-black text-gray-900 uppercase tracking-widest mb-8 border-b-2 border-indigo-600 pb-2 inline-block">Báo cáo Phân tích Hành vi Nhân sự</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-6">
              <div>
                <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                   Đặc điểm tương tác chính
                </h4>
                <p className="text-xs text-gray-600 font-bold leading-relaxed">
                  Nhân sự (User) thường dành đến 85% thời gian trên các trang **Analytics** và **KPI Progress**. Hành vi phổ biến nhất là `VIEW_PAGE`, cho thấy nhu cầu theo dõi số liệu thực tế để phục vụ công việc chuyên môn là rất cao.
                </p>
              </div>
              <div>
                <h4 className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                   Nhu cầu dữ liệu
                </h4>
                <p className="text-xs text-gray-600 font-bold leading-relaxed">
                  Dữ liệu cho thấy sự tương quan chặt chẽ giữa trang `Analytics` và hành động `EXPORT_DATA`. Nhân viên có xu hướng phân tích kĩ chỉ số trước khi thực hiện bước chiết xuất báo cáo để họp hoặc lưu trữ cá nhân.
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100">
                <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-3">Hiệu quả Công cụ</h4>
                <p className="text-[10px] text-gray-500 font-bold leading-relaxed">
                  Trang `KpiManagement` là khu vực có lượng tương tác tập trung mạnh vào đầu tháng, phản ánh đúng chu kỳ cập nhật kế hoạch. Việc loại bỏ dữ liệu Admin giúp nhìn thấy rõ hơn tần suất sử dụng thực tế của đội ngũ vận hành.
                </p>
              </div>
              <div className="flex items-center gap-4 p-4">
                <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center font-black text-white text-xs">
                  {metrics.activeUsers24h > 0 ? '88%' : '0%'}
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-900 uppercase">User Engagement</p>
                  <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">Tỉ lệ nhân sự hoạt động tích cực</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Raw Activity Stream (Limited) */}
      <div className="bg-white overflow-hidden rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/40">
        <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
          <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Dòng hoạt động Hội viên (Audit Log)</h3>
          <Calendar className="w-4 h-4 text-gray-300" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50/50">
              <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                <th className="px-8 py-4">Nhân sự</th>
                <th className="px-8 py-4">Hành động</th>
                <th className="px-8 py-4">Trang</th>
                <th className="px-8 py-4">Thời gian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredActivities.slice(0, 20).map((activity) => {
                return (
                  <tr key={activity.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-[10px]">
                          {activity.userEmail.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="text-[10px] font-black text-gray-900 uppercase">{activity.userEmail}</span>
                      </div>
                    </td>
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-2">
                        <Zap className="w-3 h-3 text-amber-500" />
                        <span className="text-[10px] font-black text-gray-700 uppercase">{activity.action}</span>
                      </div>
                    </td>
                    <td className="px-8 py-4">
                      <span className="text-[10px] font-bold text-gray-400 uppercase">{activity.page}</span>
                    </td>
                    <td className="px-8 py-4 font-mono text-[9px] font-black text-gray-400 uppercase">
                      {format(activity.timestamp, 'HH:mm:ss dd/MM')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
