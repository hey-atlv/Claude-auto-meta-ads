import React, { useState, useEffect } from 'react';
import { collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useSheetsData } from '../contexts/SheetsDataContext';
import { useActivityLogger } from '../hooks/useActivityLogger';
import { SheetConfig } from '../lib/syncService';
import { Settings as SettingsIcon, Database, Trash2, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';


const withTimeout = <T extends unknown>(promise: Promise<T>, ms: number, errorMessage = 'Operation timed out'): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), ms))
  ]);
};

export const Settings: React.FC = () => {
  const { user, role } = useAuth();
  const { refreshData } = useSheetsData();
  const { logActivity } = useActivityLogger();
  const [configs, setConfigs] = useState<SheetConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [qualityReport, setQualityReport] = useState<any | null>(null);
  const [quarantineCount, setQuarantineCount] = useState(0);
  const [isQualityLoading, setIsQualityLoading] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetName, setSheetName] = useState('Raw_Data');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    fetchConfigs();
    fetchHistory();
    fetchDataQuality();
  }, []);

  const fetchDataQuality = async () => {
    setIsQualityLoading(true);
    try {
      const [qualityRes, quarantineRes] = await Promise.all([
        fetch('/api/etl/quality-report'),
        fetch('/api/etl/quarantine')
      ]);
      if (qualityRes.ok) {
        setQualityReport(await qualityRes.json());
      }
      if (quarantineRes.ok) {
        const quarantine = await quarantineRes.json();
        setQuarantineCount(Number(quarantine.count) || 0);
      }
    } catch (error) {
      console.error('Error fetching data quality report:', error);
    } finally {
      setIsQualityLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const q = query(collection(db, 'syncHistory'), orderBy('timestamp', 'desc'), limit(10));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setHistory(data);
    } catch (e: any) {
      const isQuota = e?.message?.toLowerCase().includes('quota') || e?.code === 'resource-exhausted';
      if (!isQuota) {
        console.error("Error fetching sync history:", e);
      }
    }
  };

  const fetchConfigs = async () => {
    setIsLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'sheetsConfigs'));
      const data: SheetConfig[] = [];
      querySnapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as SheetConfig);
      });
      setConfigs(data);
      setSyncMessage(null); // Clear errors if successful
    } catch (error: any) {
      const isQuota = error?.message?.toLowerCase().includes('quota') || error?.code === 'resource-exhausted';
      if (!isQuota) {
        console.error("Error fetching configs:", error);
      }
      if (error?.message?.includes('offline') || error?.code === 'unavailable') {
        setSyncMessage("CẢNH BÁO: Không thể kết nối tới Database. Hãy kiểm tra xem mạng có đang chặn kết nối websocket không.");
      } else if (isQuota) {
        setSyncMessage("CẢNH BÁO: Quota (Hạn mức đọc/ghi) trên Google Cloud đã đạt giới hạn. Dữ liệu của bạn KHÔNG BỊ XÓA, chỉ là không thể hiển thị lúc này. Hãy kiểm tra lại ngân sách trên Firebase Console.");
      }
    }
    setIsLoading(false);
  };

  const [configToDelete, setConfigToDelete] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isSaving) return;
    setIsSaving(true);
    // Don't set global isLoading to true, to avoid full table loading spinner
    // which hides optimistic updates.

    try {
      const newConfigRef = doc(collection(db, 'sheetsConfigs'));
      const newConfigData = {
        name,
        spreadsheetId,
        sheetName,
        apiKey,
        isActive: true,
        createdByUserId: user.uid,
        createdAt: Date.now()
      };
      
      // Optimistic update
      const newConfig = { id: newConfigRef.id, ...newConfigData } as SheetConfig;
      setConfigs(prev => [newConfig, ...prev]);

      // Reset form immediately
      setName('');
      setSpreadsheetId('');
      setSheetName('Raw_Data');
      setApiKey('');
      
      await withTimeout(setDoc(newConfigRef, newConfigData), 10000, 'offline');
      
      alert("Lưu cấu hình thành công!");
      fetchConfigs(); // Try to refresh from server in background
    } catch (error: any) {
      console.error("Error saving config:", error);
      const isPermissionDenied = error?.code === 'permission-denied';
      
      // Revert optimistic update on failure (basic)
      fetchConfigs();

      if (isPermissionDenied) {
        alert("LỖI QUYỀN TRUY CẬP: Bạn không có quyền Admin để lưu cấu hình này.");
      } else {
        alert("Lỗi khi lưu cấu hình: " + (error.message || String(error)));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeleteConfig = (id: string) => {
    setConfigToDelete(id);
  };

  const executeDeleteConfig = async () => {
    if (!configToDelete) return;
    const targetId = configToDelete;
    
    // Đóng modal ngay lập tức và cập nhật giao diện (Optimistic Update)
    setConfigToDelete(null);
    setConfigs(prev => prev.filter(c => c.id !== targetId));

    try {
      // Firebase thao tác ngầm ở Local Cache và đẩy lên Server khi có mạng
      await deleteDoc(doc(db, 'sheetsConfigs', targetId));
    } catch (error: any) {
      console.error("Error deleting config:", error);
      alert(`Lỗi khi xóa cấu hình: ${error.message || error}`);
      // Lấy lại danh sách nếu xóa lỗi
      fetchConfigs();
    }
  };

  const cancelDeleteConfig = () => {
    setConfigToDelete(null);
  };

  const handleSyncData = async (config: SheetConfig) => {
    setIsSyncing(true);
    setSyncMessage('Backend đang tải dữ liệu và phân tích từ Google Sheets (có thể mất 1-2 phút do khối lượng lớn)...');
    logActivity('SYNC_DATA', '/settings', { configName: config.name });
    
    try {
      const response = await fetch('/api/manual-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configs: configs,
          spreadsheetId: config.spreadsheetId,
          sheetName: config.sheetName,
          spreadsheetName: config.name
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server Response Code: ${response.status}`);
      }

      setSyncMessage('Đang tải dữ liệu đệm từ Server về Trình duyệt...');
      await refreshData();
      await fetchDataQuality();
      
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); // YYYY-MM-DD
      const historyId = `manualsync_${todayStr}_${Date.now()}`;
      
      // Save sync history log
      await setDoc(doc(db, 'syncHistory', historyId), {
        date: todayStr,
        timestamp: Date.now(),
        status: 'SUCCESS',
        type: 'MANUAL',
        userEmail: user?.email,
        configName: config.name
      });

      setSyncMessage('Đồng bộ hoàn tất thành công! Bộ nhớ đệm đã làm mới.');
      setTimeout(() => setSyncMessage(''), 3000);
      fetchHistory();
    } catch (error: any) {
      setSyncMessage(`Lỗi đồng bộ: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const qualitySheets = Array.isArray(qualityReport?.sheets) ? qualityReport.sheets : [];
  const qualityTotals = qualityReport?.totals || {};

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50/50 p-4 md:p-8 custom-scrollbar">
      <div className="mb-10">
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Cài đặt Hệ thống</h1>
        <p className="text-sm text-gray-500 font-medium mt-1 uppercase tracking-widest">Quản lý nguồn dữ liệu và cấu hình hệ thống</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Form thêm cấu hình */}
        <div className="card-premium p-8 bg-white">
          <h2 className="text-lg font-black text-gray-900 uppercase tracking-widest mb-8 flex items-center gap-2">
            <div className="w-2 h-6 bg-blue-600 rounded-full"></div>
            Thêm Nguồn Dữ liệu
          </h2>
          <form onSubmit={handleSaveConfig} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tên cấu hình</label>
              <input 
                required
                type="text" 
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="VD: Master Database 2026"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Spreadsheet ID</label>
              <input 
                required
                type="text" 
                value={spreadsheetId}
                onChange={e => setSpreadsheetId(e.target.value)}
                placeholder="VD: 1kqVs8dyOgnk5l3CsgcGIhex-..."
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tên Tab (Sheet Name)</label>
              <input 
                required
                type="text" 
                value={sheetName}
                onChange={e => setSheetName(e.target.value)}
                placeholder="VD: Raw_Data"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Google Sheets API Key</label>
              <input 
                required
                type="password" 
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="••••••••••••••••"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none font-mono"
              />
            </div>
            <button 
              type="submit"
              disabled={isSaving}
              className="w-full bg-blue-600 text-white py-4 px-6 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
            >
              {isSaving ? 'Đang lưu...' : 'Lưu Cấu hình'}
            </button>
          </form>
        </div>

        {/* Danh sách cấu hình */}
        <div className="card-premium p-8 bg-white">
          <h2 className="text-lg font-black text-gray-900 uppercase tracking-widest mb-8 flex items-center gap-2">
            <div className="w-2 h-6 bg-emerald-500 rounded-full"></div>
            Danh sách Nguồn Dữ liệu
          </h2>
          
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Đang tải dữ liệu...</p>
            </div>
          ) : configs.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Chưa có cấu hình nào.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {configs.map(config => (
                <div key={config.id} className="group p-6 bg-gray-50 border border-gray-100 rounded-2xl hover:border-blue-200 transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">{config.name}</h3>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Tab: {config.sheetName}</p>
                    </div>
                    <button 
                      onClick={() => confirmDeleteConfig(config.id)}
                      className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <button 
                    onClick={() => handleSyncData(config)}
                    disabled={isSyncing}
                    className="w-full bg-white text-emerald-600 border border-emerald-100 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-50 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSyncing ? (
                      <>
                        <div className="w-3 h-3 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                        Đang đồng bộ...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3 h-3" />
                        Làm mới dữ liệu
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          {syncMessage && (
            <div className={clsx(
              "mt-8 p-4 rounded-xl text-[10px] font-black uppercase tracking-widest flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 shadow-lg",
              syncMessage.includes('Lỗi') || syncMessage.includes('Hết hạn mức') 
                ? 'bg-rose-50 text-rose-700 border border-rose-100' 
                : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
            )}>
              <div className="flex items-center gap-3">
                <div className={clsx(
                  "w-2.5 h-2.5 rounded-full shadow-sm",
                  syncMessage.includes('Lỗi') || syncMessage.includes('Hết hạn mức') ? 'bg-rose-500 animate-pulse' : 'bg-indigo-500'
                )}></div>
                <span className="flex-1 leading-relaxed">{syncMessage}</span>
              </div>
              
              {syncMessage.includes('Hết hạn mức') && (
                <div className="mt-2 pt-3 border-t border-rose-200/50 space-y-2">
                  <p className="text-rose-600 font-bold">Lưu ý quan trọng:</p>
                  <ul className="list-disc list-inside space-y-1 opacity-80">
                    <li>Dự án Firebase đang dùng gói Miễn phí (Spark) có giới hạn 20.000 lượt ghi mỗi ngày.</li>
                    <li>Mỗi hàng dữ liệu đồng bộ từ Sheet tính là 1 lượt ghi.</li>
                    <li>Quota sẽ tự động reset vào 14:00 giờ Việt Nam hàng ngày.</li>
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className='mt-10 card-premium p-8 bg-white'>
        <div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8'>
          <h2 className='text-lg font-black text-gray-900 uppercase tracking-widest flex items-center gap-2'>
            <div className='w-2 h-6 bg-cyan-500 rounded-full'></div>
            Chất lượng Dữ liệu
          </h2>
          <button
            onClick={fetchDataQuality}
            disabled={isQualityLoading}
            className='inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50'
          >
            <RefreshCw className={clsx('w-3 h-3', isQualityLoading && 'animate-spin')} />
            Làm mới
          </button>
        </div>

        <div className='grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8'>
          <div className='p-4 rounded-2xl bg-emerald-50 border border-emerald-100'>
            <div className='flex items-center gap-2 text-emerald-700 mb-2'>
              <ShieldCheck className='w-4 h-4' />
              <span className='text-[10px] font-black uppercase tracking-widest'>Health</span>
            </div>
            <p className='text-2xl font-black text-emerald-700'>{qualityReport?.healthScore ?? 0}</p>
          </div>
          <div className='p-4 rounded-2xl bg-gray-50 border border-gray-100'>
            <p className='text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2'>Input</p>
            <p className='text-2xl font-black text-gray-900'>{qualityTotals.inputRows ?? 0}</p>
          </div>
          <div className='p-4 rounded-2xl bg-gray-50 border border-gray-100'>
            <p className='text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2'>Output</p>
            <p className='text-2xl font-black text-gray-900'>{qualityTotals.outputRows ?? 0}</p>
          </div>
          <div className='p-4 rounded-2xl bg-amber-50 border border-amber-100'>
            <div className='flex items-center gap-2 text-amber-700 mb-2'>
              <AlertTriangle className='w-4 h-4' />
              <span className='text-[10px] font-black uppercase tracking-widest'>Quarantine</span>
            </div>
            <p className='text-2xl font-black text-amber-700'>{quarantineCount}</p>
          </div>
          <div className='p-4 rounded-2xl bg-blue-50 border border-blue-100'>
            <p className='text-[10px] font-black uppercase tracking-widest text-blue-500 mb-2'>AI Sheets</p>
            <p className='text-2xl font-black text-blue-700'>{qualityTotals.aiUsedSheets ?? 0}</p>
          </div>
        </div>

        <div className='overflow-x-auto'>
          <table className='w-full'>
            <thead>
              <tr className='border-b border-gray-100'>
                <th className='px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest'>Sheet</th>
                <th className='px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest'>Type</th>
                <th className='px-4 py-3 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest'>Input</th>
                <th className='px-4 py-3 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest'>Output</th>
                <th className='px-4 py-3 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest'>Reject</th>
                <th className='px-4 py-3 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest'>Confidence</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-50'>
              {qualitySheets.map((sheet: any) => (
                <tr key={`${sheet.spreadsheetId}_${sheet.sheetName}`} className='hover:bg-gray-50/50 transition-colors'>
                  <td className='px-4 py-3 text-[11px] font-black text-gray-900 uppercase tracking-tighter'>{sheet.sheetName}</td>
                  <td className='px-4 py-3 text-[10px] font-bold text-gray-500'>{sheet.sheetType}</td>
                  <td className='px-4 py-3 text-right text-[11px] font-bold text-gray-600'>{sheet.stats?.inputRows ?? 0}</td>
                  <td className='px-4 py-3 text-right text-[11px] font-bold text-gray-600'>{sheet.stats?.adapterOutputRows ?? sheet.stats?.outputRows ?? 0}</td>
                  <td className={clsx('px-4 py-3 text-right text-[11px] font-black', sheet.stats?.rejectedRows ? 'text-amber-600' : 'text-gray-400')}>
                    {sheet.stats?.rejectedRows ?? 0}
                  </td>
                  <td className='px-4 py-3 text-right text-[11px] font-bold text-gray-600'>{Math.round((sheet.confidence || 0) * 100)}%</td>
                </tr>
              ))}
              {qualitySheets.length === 0 && (
                <tr>
                  <td colSpan={6} className='px-4 py-10 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest'>
                    Chưa có báo cáo chất lượng.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Nhật ký đồng bộ */}
      <div className="mt-10 card-premium p-8 bg-white">
        <h2 className="text-lg font-black text-gray-900 uppercase tracking-widest mb-8 flex items-center gap-2">
          <div className="w-2 h-6 bg-indigo-500 rounded-full"></div>
          Nhật ký Đồng bộ (Gần nhất)
        </h2>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Thời gian</th>
                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Nguồn</th>
                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Loại</th>
                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Trạng thái</th>
                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Người thực hiện</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {history.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-[11px] font-bold text-gray-600">
                    {new Date(item.timestamp).toLocaleString('vi-VN')}
                  </td>
                  <td className="px-4 py-3 text-[11px] font-black text-gray-900 uppercase tracking-tighter">
                    {item.configName}
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      "px-2 py-0.5 rounded text-[9px] font-black uppercase",
                      item.type === 'AUTO' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'
                    )}>
                      {item.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      "px-2 py-0.5 rounded text-[9px] font-black uppercase",
                      item.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                    )}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[11px] font-medium text-gray-500">
                    {item.userEmail || 'System'}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    Chưa có lịch sử đồng bộ.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {configToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95">
            <h3 className="text-xl font-black text-gray-900 mb-2">Xác nhận xóa</h3>
            <p className="text-sm text-gray-500 mb-8">Bạn có chắc chắn muốn xóa nguồn dữ liệu này không? Hành động này không thể hoàn tác.</p>
            <div className="flex gap-3 justify-end">
              <button 
                onClick={cancelDeleteConfig}
                className="px-4 py-2 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Hủy
              </button>
              <button 
                onClick={executeDeleteConfig}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-rose-500 hover:bg-rose-600 shadow-md shadow-rose-500/20 transition-all active:scale-95"
              >
                Xóa cấu hình
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Debug Info */}
      <div className="mt-12 p-6 border border-dashed border-gray-300 rounded-2xl bg-gray-50/50 backdrop-blur-sm">
        <h3 className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-widest flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          Thông tin hệ thống & Kết nối
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[11px] font-mono leading-relaxed">
          <div className="space-y-2 bg-white/50 p-3 rounded-xl border border-gray-100">
            <p className="flex justify-between items-center">
              <span className="text-gray-500">Trạng thái Auth:</span> 
              <span className={user ? "text-green-600 font-bold" : "text-amber-600 font-bold"}>
                {user ? "Đang hoạt động" : "Chưa đăng nhập"}
              </span>
            </p>
            <p className="flex justify-between items-center">
              <span className="text-gray-500">Email:</span> 
              <span className="text-gray-900 truncate ml-2 max-w-[150px]">{user?.email || 'N/A'}</span>
            </p>
            <p className="flex justify-between items-center">
              <span className="text-gray-500">Vai trò:</span> 
              <span className="text-blue-600 font-bold px-1.5 py-0.5 bg-blue-50 rounded italic">
                {role || 'Đang tải...'}
              </span>
            </p>
          </div>
          <div className="space-y-2 bg-white/50 p-3 rounded-xl border border-gray-100">
            <p className="flex justify-between items-center">
              <span className="text-gray-500">Firestore ID:</span> 
              <span className="text-gray-900">auto-meta-ads-db2</span>
            </p>
            <p className="flex justify-between items-center">
              <span className="text-gray-500">Vùng Dữ liệu:</span> 
              <span className="text-gray-900">asia-southeast1</span>
            </p>
            <div className="pt-1">
              <span className="text-gray-500 mb-1 block">Lỗi kết nối gần nhất:</span> 
              <div className="text-rose-500 break-words leading-tight p-2 bg-rose-50 rounded border border-rose-100 min-h-[40px]">
                {syncMessage || 'Không có lỗi được ghi nhận.'}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <button 
            onClick={() => window.location.reload()}
            className="text-[10px] bg-white border border-gray-200 px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5 font-medium"
          >
            <RefreshCw size={12} />
            Làm mới bộ nhớ đệm (Reload)
          </button>
        </div>
      </div>
    </div>
  );
};
