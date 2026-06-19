import React, { useState, useMemo, useEffect } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ChevronUp, ChevronDown, ChevronsUpDown, TrendingUp, TrendingDown, Minus, Check, Copy, Settings2 } from 'lucide-react';
import { SopConfigEditor } from '../components/SopConfigEditor';
import { collection, query, where, onSnapshot, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';
import { useSheetsData, normalizePersonnelName } from '../contexts/SheetsDataContext';
import { useAuth } from '../contexts/AuthContext';
import { isCampaignMatchContent } from '../lib/contentMatcher';
import { getSopStatus } from '../lib/sopEvaluator';
import { formatVND, formatInteger } from '../lib/formatUtils';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

// ─── helpers ─────────────────────────────────────────────────────────────────
const kyToMonth = (ky: string) => ky.startsWith('thang') ? parseInt(ky.replace('thang', ''), 10) : null;
const monthLabel = (m: number) => `T${m}`;
const getPrevKys = (ky: string): [string | null, string | null] => {
  const m = kyToMonth(ky);
  if (!m) return [null, null];
  return [m > 1 ? `thang${m - 1}` : null, m > 2 ? `thang${m - 2}` : null];
};
const matchMonth = (date: string, kyStr: string) => {
  if (!kyStr || kyStr === 'tong_nam' || !kyStr.startsWith('thang')) return true;
  const m = kyStr.replace('thang', '').padStart(2, '0');
  return date.startsWith(`2026-${m}`);
};
const median = (arr: number[]) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const fmtCP   = (v: number) => v > 0 ? formatVND(v) : '–';
const fmtSL   = (v: number) => v > 0 ? formatInteger(v) : '–';
const fmtCPL  = (v: number) => v > 0 ? formatVND(v) : '–';
const fmtRoas = (v: number) => v > 0 ? `${v.toFixed(2)}x` : '–';
const fmtCldt = (v: number) => v > 0 ? `${v.toFixed(1)}%` : '–';

// ─── SOP verdict styling ──────────────────────────────────────────────────────
const VERDICT_STYLES: Record<string, { bg: string; text: string; border: string; dot: string; short: string; left: string }> = {
  'Tầng 3 - Scale':    { bg:'bg-emerald-50', text:'text-emerald-700', border:'border-emerald-300', dot:'bg-emerald-500', short:'T3 Scale',     left:'border-l-emerald-500' },
  'Tầng 3 - Giữ':     { bg:'bg-blue-50',    text:'text-blue-700',    border:'border-blue-300',    dot:'bg-blue-500',    short:'T3 Giữ',       left:'border-l-blue-400' },
  'Tầng 3 - Cân nhắc':{ bg:'bg-orange-50',  text:'text-orange-700',  border:'border-orange-300',  dot:'bg-orange-400',  short:'T3 Cân nhắc',  left:'border-l-orange-400' },
  'Tầng 3 - Cắt bỏ':  { bg:'bg-rose-50',    text:'text-rose-700',    border:'border-rose-300',    dot:'bg-rose-500',    short:'T3 Cắt bỏ',    left:'border-l-rose-500' },
  'Tầng 2 - Cắt/Giảm':{ bg:'bg-amber-50',   text:'text-amber-700',   border:'border-amber-300',   dot:'bg-amber-400',   short:'T2 Cắt',       left:'border-l-amber-400' },
  'Tầng 2 - Theo dõi':{ bg:'bg-sky-50',     text:'text-sky-700',     border:'border-sky-300',     dot:'bg-sky-400',     short:'T2 Theo dõi',  left:'border-l-sky-300' },
  'Tầng 1 - Cắt sớm': { bg:'bg-rose-50',    text:'text-rose-600',    border:'border-rose-200',    dot:'bg-rose-400',    short:'T1 Cắt',       left:'border-l-rose-300' },
};
const VERDICT_ORDER = ['Tầng 1 - Cắt sớm','Tầng 2 - Cắt/Giảm','Tầng 2 - Theo dõi','Tầng 3 - Cắt bỏ','Tầng 3 - Cân nhắc','Tầng 3 - Giữ','Tầng 3 - Scale'];

// ─── sub-components ──────────────────────────────────────────────────────────
const VerdictChip = ({ label, active, count, onClick }: { label: string; active: boolean; count: number; onClick: () => void }) => {
  const s = VERDICT_STYLES[label];
  return (
    <button onClick={onClick} className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all',
      active && s ? `${s.bg} ${s.text} ${s.border} ring-2 ring-offset-1` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300',
    )}>
      {s && <span className={cn('w-2 h-2 rounded-full', s.dot)} />}
      {s ? s.short : label}
      <span className={cn('ml-0.5 px-1.5 rounded-full text-[9px] font-bold', active && s ? 'bg-white/60' : 'bg-gray-100 text-gray-500')}>{count}</span>
    </button>
  );
};

type SortDir = 'asc' | 'desc';
type SortKey = string;

const SortIcon = ({ col, sortKey, sortDir }: { col: string; sortKey: SortKey; sortDir: SortDir }) => {
  if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-25 inline ml-0.5" />;
  return sortDir === 'asc'
    ? <ChevronUp className="w-3 h-3 text-blue-500 inline ml-0.5" />
    : <ChevronDown className="w-3 h-3 text-blue-500 inline ml-0.5" />;
};

const DeltaArrow = ({ curr, prev }: { curr: number; prev: number }) => {
  if (!prev || !curr) return null;
  const d = (curr - prev) / prev;
  if (Math.abs(d) < 0.03) return <Minus className="w-2.5 h-2.5 text-gray-400 inline ml-0.5" />;
  if (d > 0) return <TrendingUp className="w-2.5 h-2.5 text-emerald-500 inline ml-0.5" />;
  return <TrendingDown className="w-2.5 h-2.5 text-rose-500 inline ml-0.5" />;
};

const KpiCard = ({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-3.5 shadow-sm relative overflow-hidden">
    <div className={cn('absolute top-0 left-0 right-0 h-[3px]', accent)} />
    <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</div>
    <div className="text-[17px] font-bold tabular-nums text-gray-800 leading-tight">{value}</div>
    {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
  </div>
);

// ─── default SOP config (same defaults as Alerts.tsx, overridden by shared localStorage key) ──
const DEFAULT_SOP_CONFIG = {
  trong_nuoc: { t1_mess_min:20, t1_tlcd_min:0.5, t1_cpl_max:500000,  t2_data_min:5, t2_cpl_max:250000, t2_cldt_min:5.0,  t3_data_min:30, t3_roas_scale:2.0, t3_roas_cut:1.0, t3_cldt_min:10.0 },
  nuoc_ngoai: { t1_mess_min:20, t1_tlcd_min:1.0, t1_cpl_max:1000000, t2_data_min:5, t2_cpl_max:600000, t2_cldt_min:10.0, t3_data_min:50, t3_roas_scale:2.5, t3_roas_cut:1.5, t3_cldt_min:20.0 },
};

// ─── main page ────────────────────────────────────────────────────────────────
export const Alerts = () => {
  const { role, user } = useAuth();
  const { rawRows, contents, performance: allPerformance, fanpagesMap } = useSheetsData();

  const [alertTab,     setAlertTab]     = useState<'trong_nuoc'|'nuoc_ngoai'>('trong_nuoc');
  const [ky,           setKy]           = useState(`thang${new Date().getMonth() + 1}`);
  const [statusFilter, setStatusFilter] = useState<'all'|'running'|'off'>('running');
  const [verdictFilter,setVerdictFilter]= useState('Tất cả');
  const [sortKey,      setSortKey]      = useState<SortKey>('chiPhiT');
  const [sortDir,      setSortDir]      = useState<SortDir>('desc');
  const [editingNote,  setEditingNote]  = useState<string | null>(null);
  const [noteValue,    setNoteValue]    = useState('');
  const [copiedId,     setCopiedId]     = useState<string | null>(null);
  const [decideError,  setDecideError]  = useState<string | null>(null);
  const [showConfig,   setShowConfig]   = useState(false);
  const [configTab,    setConfigTab]    = useState<'trong_nuoc' | 'nuoc_ngoai'>('trong_nuoc');

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const [sopConfig, setSopConfig] = useState(() => {
    try { const s = localStorage.getItem('sopConfig'); return s ? { ...DEFAULT_SOP_CONFIG, ...JSON.parse(s) } : DEFAULT_SOP_CONFIG; }
    catch { return DEFAULT_SOP_CONFIG; }
  });

  useEffect(() => {
    localStorage.setItem('sopConfig', JSON.stringify(sopConfig));
  }, [sopConfig]);

  const [prevKy, prev2Ky] = useMemo(() => getPrevKys(ky), [ky]);
  const curM  = kyToMonth(ky);
  const prevM = prevKy  ? kyToMonth(prevKy)  : null;
  const p2M   = prev2Ky ? kyToMonth(prev2Ky) : null;

  // ── SOP decisions (Firestore real-time) — same collection/doc-id scheme as v1 ──
  const [sopDecisions, setSopDecisions] = useState<Record<string, any>>({});
  useEffect(() => {
    const q = query(collection(db, 'sopDecisions'), where('ky', '==', ky));
    const unsub = onSnapshot(q, snap => {
      const decisions: Record<string, any> = {};
      snap.forEach(d => { decisions[d.id] = { id: d.id, ...d.data() }; });
      setSopDecisions(decisions);
    });
    return () => unsub();
  }, [ky]);

  const handleDecide = async (contentId: string, vungParam: string) => {
    const docId = `${contentId}_${vungParam}_${ky}`.replace(/[^a-zA-Z0-9_]/g, '_');
    try {
      await setDoc(doc(db, 'sopDecisions', docId), {
        contentId, vung: vungParam, ky,
        decision: 'cut',
        approvedBy: (user as any)?.displayName || (user as any)?.email || 'Leader',
        approvedAt: format(new Date(), 'yyyy-MM-dd'),
        note: ''
      });
    } catch (err) {
      console.error('[sopDecisions v2] write failed:', err);
      setDecideError('Không thể lưu quyết định. Kiểm tra kết nối và thử lại.');
    }
  };
  const handleCancelDecide = async (contentId: string, vungParam: string) => {
    const docId = `${contentId}_${vungParam}_${ky}`.replace(/[^a-zA-Z0-9_]/g, '_');
    try { await deleteDoc(doc(db, 'sopDecisions', docId)); }
    catch (err) { console.error('[sopDecisions v2] delete failed:', err); setDecideError('Không thể hủy quyết định. Vui lòng thử lại.'); }
  };
  const handleUpdateNote = async (contentId: string, vungParam: string, note: string) => {
    const docId = `${contentId}_${vungParam}_${ky}`.replace(/[^a-zA-Z0-9_]/g, '_');
    await setDoc(doc(db, 'sopDecisions', docId), { contentId, vung: vungParam, ky, note }, { merge: true });
  };

  // ── Build per-content rows — mirrors Alerts.tsx joinedData two-pass algorithm exactly ──
  const rows = useMemo(() => {
    const byKy = (k: string | null) => k ? allPerformance.filter(p => p.ky === k) : [];
    const perfT  = byKy(ky);
    const perfP1 = byKy(prevKy);
    const perfP2 = byKy(prev2Ky);

    const maxDateND = rawRows.reduce((max, r) => (r.market === 'Nội Địa'  && r.date > max) ? r.date : max, '');
    const maxDateVK = rawRows.reduce((max, r) => (r.market === 'Việt Kiều' && r.date > max) ? r.date : max, '');

    const base = perfT.filter(p => p.tenContent && /^\d{4,6}/.test(p.tenContent) && (p.chiPhi || 0) > 0);

    // Pass 1: gather per-row context
    let results = base.map(p => {
      const vung = p.vung as 'trong_nuoc' | 'nuoc_ngoai';
      const c = contents.find(d => d.id === p.tenContent || d.docId === p.tenContent);
      const targetId = c?.id || p.tenContent;
      const rootId = targetId ? (targetId.match(/^(\d{4,})/)?.[1] || null) : null;

      const p1 = perfP1.find(x => x.tenContent === p.tenContent && x.vung === vung);
      const p2 = perfP2.find(x => x.tenContent === p.tenContent && x.vung === vung);

      const rawCldt = vung === 'nuoc_ngoai' ? c?.cldt_nn_tich_cuc : c?.cldt_nd_tich_cuc;
      const cldt = rawCldt != null ? rawCldt * 100 : 0;

      return { p, c, vung, targetId, rootId, p1, p2, cldt, messages2T: 0, campaignMaxDate: '' };
    });

    // Build rootId -> rawRows index (same grouping as Alerts.tsx)
    const rowGroups = new Map<string, any[]>();
    rawRows.forEach(r => {
      if (!r.campaign_name) return;
      const nums = r.campaign_name.match(/(\d{4,})/g);
      if (!nums) return;
      nums.forEach((num: string) => {
        let arr = rowGroups.get(num);
        if (!arr) { arr = []; rowGroups.set(num, arr); }
        arr.push(r);
      });
    });

    // Pass 2: scan matching rawRows for messages (current+prev only) and campaignMaxDate (all-time, any spend)
    results.forEach(res => {
      const rowsToCheck = res.rootId ? (rowGroups.get(res.rootId) || []) : rawRows;
      rowsToCheck.forEach((r: any) => {
        const isKyMatch = matchMonth(r.date, ky);
        const isPrevKyMatch = prevKy ? matchMonth(r.date, prevKy) : false;
        const msgRelevant = isKyMatch || isPrevKyMatch;
        const hasSpend = (r.spend || 0) > 0;
        if (!msgRelevant && !hasSpend) return;

        const fullAdText = (r.campaign_name || '') + ' ' + (r.ad_name || '');
        if (!(res.targetId && fullAdText && isCampaignMatchContent(fullAdText, res.targetId, res.rootId))) return;
        if (res.vung === 'trong_nuoc' && r.market !== 'Nội Địa') return;
        if (res.vung === 'nuoc_ngoai' && r.market !== 'Việt Kiều') return;

        if (msgRelevant) res.messages2T += (r.messages || 0);
        if (hasSpend && r.date > res.campaignMaxDate) res.campaignMaxDate = r.date;
      });
    });

    return results.map(res => {
      const { p, c, vung, p1, p2, cldt, messages2T, campaignMaxDate } = res;

      const targetMaxDate = vung === 'trong_nuoc' ? maxDateND : maxDateVK;
      let isRunning = false;
      if (targetMaxDate && campaignMaxDate) {
        const diff = (new Date(targetMaxDate).getTime() - new Date(campaignMaxDate).getTime()) / 86400000;
        isRunning = diff <= 1;
      }

      const chiPhiT = p.chiPhi || 0;
      const slDataT = p.slData || 0;
      const cplT    = slDataT > 0 ? chiPhiT / slDataT : 0;
      const roasT   = (vung === 'trong_nuoc' ? p.roasTrong : p.roas3Thang) || 0;

      const chiPhiP1 = p1?.chiPhi || 0;
      const slDataP1 = p1?.slData || 0;
      const cplP1    = slDataP1 > 0 ? chiPhiP1 / slDataP1 : 0;
      const roasP1   = p1 ? ((vung === 'trong_nuoc' ? p1.roasTrong : p1.roas3Thang) || 0) : 0;

      const chiPhiP2 = p2?.chiPhi || 0;
      const slDataP2 = p2?.slData || 0;
      const cplP2    = slDataP2 > 0 ? chiPhiP2 / slDataP2 : 0;
      const roasP2   = p2 ? ((vung === 'trong_nuoc' ? p2.roasTrong : p2.roas3Thang) || 0) : 0;

      // SOP verdict — same shape as v1's joinedData row consumed by getSopStatus
      const sopRow = {
        messages: messages2T,
        chiPhi: chiPhiT + chiPhiP1, slData: slDataT + slDataP1,
        chiPhiHT: chiPhiT, slDataHT: slDataT,
        chiPhiPrev: chiPhiP1, slDataPrev: slDataP1,
        cldt,
        roasTrong: p.roasTrong || 0, roas3Thang: p.roas3Thang || 0,
        roasTrongPrev: p1?.roasTrong || 0, roas3ThangPrev: p1?.roas3Thang || 0,
      };
      const sop = getSopStatus(sopRow, vung, sopConfig);

      return {
        id: p.tenContent, tenContent: p.tenContent, kenh: c?.kenh, phanLoai: c?.phanLoai, vung, isRunning, trangThai: isRunning ? 'Đang chạy' : 'Tắt',
        chiPhiT, slDataT, cplT, roasT,
        chiPhiP1, slDataP1, cplP1, roasP1,
        chiPhiP2, slDataP2, cplP2, roasP2,
        cldt, sop, sopLevel: sop?.level ?? null,
      };
    });
  }, [allPerformance, contents, rawRows, ky, prevKy, prev2Ky, sopConfig]);

  // ── runnersMap / latestRunnersMap — identical computation to Alerts.tsx ──
  const { runnersMap, latestRunnersMap } = useMemo(() => {
    const allMap: Record<string, string[]> = {};
    const latestMap: Record<string, { date: string; runners: string[] }> = {};
    rows.forEach(item => {
      const { tenContent, vung: itemVung } = item;
      if (!tenContent) return;
      const rootId = tenContent.match(/^(\d{4,})/)?.[1] || null;
      const seen = new Set<string>();
      const runnerLatest: Record<string, string> = {};
      let maxDate = '';
      rawRows.forEach((r: any) => {
        if (!r.page_code) return;
        if (itemVung === 'trong_nuoc' && r.market !== 'Nội Địa') return;
        if (itemVung === 'nuoc_ngoai' && r.market !== 'Việt Kiều') return;
        if (!matchMonth(r.date, ky) || !(r.spend > 0)) return;
        const txt = (r.campaign_name || '') + ' ' + (r.ad_name || '');
        if (!isCampaignMatchContent(txt, tenContent, rootId)) return;
        const pageKey = encodeURIComponent((r.page_code as string).replace(/[\/\s]/g, '_').toLowerCase());
        const runner = (fanpagesMap as any)[pageKey]?.runner || normalizePersonnelName(r.page_code) || r.page_code;
        seen.add(runner);
        const day: string = r.date;
        if (!runnerLatest[runner] || day > runnerLatest[runner]) runnerLatest[runner] = day;
        if (day > maxDate) maxDate = day;
      });
      const key = `${tenContent}_${itemVung}`;
      allMap[key] = Array.from(seen);
      if (maxDate) {
        const maxTime = new Date(maxDate).getTime();
        const latestRunners = Object.entries(runnerLatest)
          .filter(([, day]) => (maxTime - new Date(day).getTime()) / 86400000 <= 2)
          .map(([runner]) => runner);
        latestMap[key] = { date: maxDate, runners: latestRunners };
      }
    });
    return { runnersMap: allMap, latestRunnersMap: latestMap };
  }, [rows, rawRows, fanpagesMap, ky]);

  const tabRows = useMemo(() => rows.filter(r => r.vung === alertTab), [rows, alertTab]);

  const filteredRows = useMemo(() => {
    let r = tabRows;
    if (statusFilter === 'running') r = r.filter(x => x.isRunning);
    if (statusFilter === 'off')     r = r.filter(x => !x.isRunning);
    if (verdictFilter !== 'Tất cả') r = r.filter(x => x.sopLevel === verdictFilter);
    return [...r].sort((a, b) => {
      const av = (a as any)[sortKey] ?? 0;
      const bv = (b as any)[sortKey] ?? 0;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [tabRows, statusFilter, verdictFilter, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const verdictCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    tabRows.forEach(r => { if (r.sopLevel) counts[r.sopLevel] = (counts[r.sopLevel] || 0) + 1; });
    return counts;
  }, [tabRows]);

  const kpis = useMemo(() => {
    const r = tabRows;
    const cpls  = r.filter(x => x.cplT  > 0).map(x => x.cplT);
    const roases = r.filter(x => x.roasT > 0).map(x => x.roasT);
    return {
      totalCP: r.reduce((s, x) => s + x.chiPhiT, 0),
      totalSL: r.reduce((s, x) => s + x.slDataT, 0),
      medCPL: median(cpls),
      medROAS: median(roases),
      running: r.filter(x => x.isRunning).length,
      total: r.length,
      needAction: r.filter(x => x.sopLevel?.includes('Cắt') || x.sopLevel?.includes('Cân nhắc')).length,
    };
  }, [tabRows]);

  const medians = useMemo(() => ({
    cp:   median(filteredRows.filter(x => x.chiPhiT > 0).map(x => x.chiPhiT)),
    sl:   median(filteredRows.filter(x => x.slDataT > 0).map(x => x.slDataT)),
    cpl:  median(filteredRows.filter(x => x.cplT    > 0).map(x => x.cplT)),
    roas: median(filteredRows.filter(x => x.roasT   > 0).map(x => x.roasT)),
    cldt: median(filteredRows.filter(x => x.cldt    > 0).map(x => x.cldt)),
  }), [filteredRows]);

  const numCls = (v: number, med: number, highIsBad = false) => {
    if (!v || !med) return 'text-gray-600';
    const ratio = v / med;
    if (highIsBad) return ratio > 1.3 ? 'text-rose-600 font-semibold' : ratio < 0.7 ? 'text-emerald-600 font-semibold' : 'text-gray-700';
    return ratio > 1.3 ? 'text-emerald-600 font-semibold' : ratio < 0.7 ? 'text-rose-600 font-semibold' : 'text-gray-700';
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const kyOptions = [1,2,3,4,5,6,7,8,9,10,11,12].map(m => ({ value:`thang${m}`, label:`Tháng ${m}` }));

  const TH  = 'px-1 py-1.5 text-right text-[8px] font-bold uppercase tracking-wide text-gray-400 whitespace-nowrap cursor-pointer hover:text-blue-500 select-none overflow-hidden';
  const THL = 'px-1.5 py-1.5 text-left text-[8px] font-bold uppercase tracking-wide text-gray-400 whitespace-nowrap select-none overflow-hidden';

  // every month block always shows the same 4 metrics: CP, SL, CPL, ROAS
  const MonthCols = ({ cp, sl, cpl, roas, dim }: { cp: number; sl: number; cpl: number; roas: number; dim?: boolean }) => (
    <>
      <td className={cn('px-1 py-1.5 text-right tabular-nums truncate text-[9px]', dim ? 'text-gray-400' : 'text-gray-600')}>{fmtCP(cp)}</td>
      <td className={cn('px-1 py-1.5 text-right tabular-nums truncate', dim ? 'text-gray-400' : 'text-gray-600')}>{fmtSL(sl)}</td>
      <td className={cn('px-1 py-1.5 text-right tabular-nums truncate text-[9px]', dim ? 'text-gray-400' : 'text-gray-600')}>{fmtCPL(cpl)}</td>
      <td className={cn('px-1 py-1.5 text-right tabular-nums truncate', dim ? 'text-gray-400' : 'text-gray-600')}>{fmtRoas(roas)}</td>
    </>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-[#f0f2f7] min-h-screen custom-scrollbar">
      <div className="max-w-[1700px] mx-auto px-4 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-black tracking-tight text-gray-900 uppercase">
              Cảnh Báo Content
            </h1>
            <p className="text-[11px] text-gray-400 mt-0.5">Đa tháng · Sortable · Median reference · SOP verdict</p>
          </div>
          <div className="flex items-center gap-2">
            {role === 'admin' && (
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="px-4 py-2 border border-blue-600 text-blue-600 bg-blue-50 hover:bg-blue-600 hover:text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
              >
                <Settings2 className="w-4 h-4" />
                {showConfig ? 'Đóng Cấu Hình' : 'Cấu Hình SOP'}
              </button>
            )}
            <select
              value={ky}
              onChange={e => setKy(e.target.value)}
              className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-800 outline-none shadow-sm cursor-pointer"
            >
              {kyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {decideError && (
          <div className="px-4 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-center justify-between">
            <span>⚠️ {decideError}</span>
            <button onClick={() => setDecideError(null)} className="ml-4 text-red-400 hover:text-red-600 font-bold">✕</button>
          </div>
        )}

        {showConfig && (
          <div className="space-y-3">
            <div className="flex gap-3">
              <button
                className={cn('flex-1 py-2.5 px-4 font-semibold text-xs text-center tracking-wider uppercase transition-colors border rounded-lg shadow-sm',
                  configTab === 'trong_nuoc' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50 bg-white'
                )}
                onClick={() => setConfigTab('trong_nuoc')}
              >
                Cấu Hình SOP (Trong Nước)
              </button>
              <button
                className={cn('flex-1 py-2.5 px-4 font-semibold text-xs text-center tracking-wider uppercase transition-colors border rounded-lg shadow-sm',
                  configTab === 'nuoc_ngoai' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50 bg-white'
                )}
                onClick={() => setConfigTab('nuoc_ngoai')}
              >
                Cấu Hình SOP (Nước Ngoài)
              </button>
            </div>
            <SopConfigEditor
              title=""
              vung={configTab}
              sopConfig={sopConfig}
              setSopConfig={setSopConfig}
              type="content"
            />
          </div>
        )}

        {/* Tabs + Status */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
            {(['trong_nuoc','nuoc_ngoai'] as const).map(v => (
              <button key={v} onClick={() => setAlertTab(v)} className={cn(
                'px-5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all',
                alertTab === v ? 'bg-gray-900 text-white shadow' : 'text-gray-400 hover:text-gray-700'
              )}>
                {v === 'trong_nuoc' ? 'Nội Địa' : 'Nước Ngoài'}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {([['all','Tất cả'],['running','Đang chạy'],['off','Đã tắt']] as const).map(([v,l]) => (
              <button key={v} onClick={() => setStatusFilter(v)} className={cn(
                'px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all',
                statusFilter === v
                  ? v === 'running' ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-2 ring-emerald-200'
                    : v === 'off'   ? 'bg-gray-100 text-gray-700 border-gray-300 ring-2 ring-gray-200'
                    : 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
              )}>{l}</button>
            ))}
          </div>
        </div>

        {/* Verdict filter chips */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">SOP:</span>
          <button onClick={() => setVerdictFilter('Tất cả')} className={cn(
            'px-3 py-1 rounded-full text-[11px] font-semibold border transition-all',
            verdictFilter === 'Tất cả' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
          )}>
            Tất cả <span className="ml-1 text-[9px] opacity-60">{tabRows.length}</span>
          </button>
          {VERDICT_ORDER.filter(v => verdictCounts[v] > 0).map(v => (
            <VerdictChip key={v} label={v} active={verdictFilter === v} count={verdictCounts[v] || 0}
              onClick={() => setVerdictFilter(verdictFilter === v ? 'Tất cả' : v)} />
          ))}
        </div>

        {/* Median bar */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
          <span className="font-black uppercase text-[9px] tracking-widest text-gray-400 shrink-0">
            Median ({filteredRows.length}):
          </span>
          {[
            { label:'Chi Phí', val: fmtCP(medians.cp) },
            { label:'SL Data', val: fmtSL(medians.sl) },
            { label:'CPL',     val: fmtCPL(medians.cpl) },
            { label:'ROAS',    val: fmtRoas(medians.roas) },
            { label:'CLDT',    val: fmtCldt(medians.cldt) },
          ].map(({ label, val }) => (
            <span key={label} className="flex items-center gap-1.5 text-[11px]">
              <span className="text-gray-400">{label}</span>
              <span className="font-bold tabular-nums text-gray-800">{val}</span>
            </span>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse table-fixed" style={{ fontSize: '10px' }}>
              <colgroup>
                <col style={{ width: '150px' }} />
                <col style={{ width: '34px' }} />
                {p2M && <>
                  <col style={{ width: '58px' }} /><col style={{ width: '34px' }} /><col style={{ width: '60px' }} /><col style={{ width: '40px' }} />
                </>}
                {prevM && <>
                  <col style={{ width: '58px' }} /><col style={{ width: '34px' }} /><col style={{ width: '60px' }} /><col style={{ width: '40px' }} />
                </>}
                <col style={{ width: '62px' }} /><col style={{ width: '36px' }} /><col style={{ width: '64px' }} /><col style={{ width: '42px' }} />
                <col style={{ width: '38px' }} />
                <col style={{ width: '62px' }} />
                <col style={{ width: '70px' }} />
                <col style={{ width: '92px' }} />
                <col style={{ width: '110px' }} />
              </colgroup>
              <thead>
                {/* Month group row */}
                <tr className="bg-[#f5f6fa] border-b border-gray-100">
                  <th className="px-1.5 py-1" colSpan={2} />
                  {p2M && (
                    <th colSpan={4} className="px-1 py-1 text-center text-[9px] font-bold text-blue-400 border-b-2 border-blue-200 truncate">
                      {monthLabel(p2M)}
                    </th>
                  )}
                  {prevM && (
                    <th colSpan={4} className="px-1 py-1 text-center text-[9px] font-bold text-teal-500 border-b-2 border-teal-300 truncate">
                      {monthLabel(prevM)}
                    </th>
                  )}
                  {curM && (
                    <th colSpan={4} className="px-1 py-1 text-center text-[9px] font-extrabold text-white bg-orange-500 border-b-2 border-orange-600 truncate">
                      {monthLabel(curM)} ◀
                    </th>
                  )}
                  <th colSpan={1} />
                  <th colSpan={4} className="px-1 py-1 text-center text-[9px] font-bold text-violet-500 border-b-2 border-violet-300 truncate">
                    Vận hành
                  </th>
                </tr>
                {/* Column names row */}
                <tr className="bg-[#f5f6fa] border-b-2 border-gray-200">
                  <th className={THL}>Content</th>
                  <th className={THL}>Trạng thái</th>
                  {p2M && <>
                    <th className={TH} onClick={() => handleSort('chiPhiP2')}>CP <SortIcon col="chiPhiP2" sortKey={sortKey} sortDir={sortDir} /></th>
                    <th className={TH} onClick={() => handleSort('slDataP2')}>SL <SortIcon col="slDataP2" sortKey={sortKey} sortDir={sortDir} /></th>
                    <th className={TH} onClick={() => handleSort('cplP2')}>CPL <SortIcon col="cplP2" sortKey={sortKey} sortDir={sortDir} /></th>
                    <th className={TH} onClick={() => handleSort('roasP2')}>ROAS <SortIcon col="roasP2" sortKey={sortKey} sortDir={sortDir} /></th>
                  </>}
                  {prevM && <>
                    <th className={TH} onClick={() => handleSort('chiPhiP1')}>CP <SortIcon col="chiPhiP1" sortKey={sortKey} sortDir={sortDir} /></th>
                    <th className={TH} onClick={() => handleSort('slDataP1')}>SL <SortIcon col="slDataP1" sortKey={sortKey} sortDir={sortDir} /></th>
                    <th className={TH} onClick={() => handleSort('cplP1')}>CPL <SortIcon col="cplP1" sortKey={sortKey} sortDir={sortDir} /></th>
                    <th className={TH} onClick={() => handleSort('roasP1')}>ROAS <SortIcon col="roasP1" sortKey={sortKey} sortDir={sortDir} /></th>
                  </>}
                  <th className={cn(TH, 'bg-orange-50')} onClick={() => handleSort('chiPhiT')}>CP <SortIcon col="chiPhiT" sortKey={sortKey} sortDir={sortDir} /></th>
                  <th className={cn(TH, 'bg-orange-50')} onClick={() => handleSort('slDataT')}>SL <SortIcon col="slDataT" sortKey={sortKey} sortDir={sortDir} /></th>
                  <th className={cn(TH, 'bg-orange-50')} onClick={() => handleSort('cplT')}>CPL <SortIcon col="cplT" sortKey={sortKey} sortDir={sortDir} /></th>
                  <th className={cn(TH, 'bg-orange-50')} onClick={() => handleSort('roasT')}>ROAS <SortIcon col="roasT" sortKey={sortKey} sortDir={sortDir} /></th>
                  <th className={TH} onClick={() => handleSort('cldt')}>CLDT <SortIcon col="cldt" sortKey={sortKey} sortDir={sortDir} /></th>
                  <th className={THL}>SOP</th>
                  <th className={THL}>Người Chạy</th>
                  <th className={THL}>Yêu Cầu</th>
                  <th className={THL}>Log</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.length === 0 && (
                  <tr><td colSpan={99} className="py-16 text-center text-gray-400">Không có dữ liệu phù hợp</td></tr>
                )}
                {filteredRows.map(row => {
                  const vs = row.sopLevel ? VERDICT_STYLES[row.sopLevel] : null;
                  const sopLevel = row.sopLevel || '';
                  const isCutSop = sopLevel.includes('Cắt');
                  const isConsiderSop = sopLevel.includes('Cân nhắc');

                  const docId = `${row.tenContent}_${row.vung}_${ky}`.replace(/[^a-zA-Z0-9_]/g, '_');
                  const decision = sopDecisions[docId];
                  const isNonCompliant = decision && decision.approvedAt < todayStr && row.trangThai === 'Đang chạy';
                  const isPending = decision && decision.approvedAt === todayStr && row.trangThai === 'Đang chạy';
                  const isComplied = decision && row.trangThai === 'Tắt';
                  const hasFormalDecision = !!decision?.approvedAt;
                  const isEditing = editingNote === docId;

                  const runners: string[] = runnersMap[`${row.tenContent}_${row.vung}`] || [];

                  const latest = latestRunnersMap[`${row.tenContent}_${row.vung}`];
                  const latestDate = latest?.date || '';
                  const latestRunnersList = latest?.runners || [];
                  const stillRunning = row.trangThai === 'Đang chạy' && !!latestDate && latestRunnersList.length > 0;
                  const daysPast = (latestDate && decision?.approvedAt)
                    ? Math.floor((new Date(latestDate).getTime() - new Date(decision.approvedAt).getTime()) / 86400000)
                    : 0;

                  return (
                    <tr key={row.id} className={cn('border-l-[3px] hover:bg-gray-50/70 transition-colors', vs ? vs.left : 'border-l-gray-100')}>
                      {/* Content — full tenContent, same as v1 */}
                      <td className="px-1.5 py-1.5 overflow-hidden">
                        <div className="flex items-center gap-1 overflow-hidden">
                          <span className="font-semibold text-[10px] text-gray-900 truncate" title={row.tenContent}>{row.tenContent}</span>
                          <button onClick={() => handleCopy(row.tenContent, row.id)} className="text-gray-300 hover:text-gray-700 shrink-0">
                            {copiedId === row.id ? <Check className="w-2.5 h-2.5 text-emerald-500" /> : <Copy className="w-2.5 h-2.5" />}
                          </button>
                        </div>
                        {(row.kenh || row.phanLoai) && (
                          <div className="text-[8px] text-gray-400 font-semibold uppercase tracking-wide truncate">
                            {row.kenh}{row.phanLoai ? ` • ${row.phanLoai}` : ''}
                          </div>
                        )}
                      </td>

                      {/* Status — icon-only pill, same compact style as v1 */}
                      <td className="px-1 py-1.5 text-center">
                        <span className={cn('inline-flex px-1 py-0.5 rounded-full text-[8px] font-bold uppercase',
                          row.isRunning ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/50' : 'bg-gray-100 text-gray-500 border border-gray-200/50'
                        )} title={row.isRunning ? 'Đang chạy' : 'Tắt'}>
                          {row.isRunning ? '▶' : '■'}
                        </span>
                      </td>

                      {/* T-2 */}
                      {p2M && <MonthCols cp={row.chiPhiP2} sl={row.slDataP2} cpl={row.cplP2} roas={row.roasP2} dim />}

                      {/* T-1 */}
                      {prevM && (
                        <>
                          <td className="px-1 py-1.5 text-right tabular-nums text-gray-500 truncate text-[9px]">
                            {fmtCP(row.chiPhiP1)}<DeltaArrow curr={row.chiPhiT} prev={row.chiPhiP1} />
                          </td>
                          <td className="px-1 py-1.5 text-right tabular-nums text-gray-500 truncate">{fmtSL(row.slDataP1)}</td>
                          <td className="px-1 py-1.5 text-right tabular-nums text-gray-500 truncate text-[9px]">{fmtCPL(row.cplP1)}</td>
                          <td className="px-1 py-1.5 text-right tabular-nums text-gray-500 truncate">{fmtRoas(row.roasP1)}</td>
                        </>
                      )}

                      {/* T current — colored vs median, highlighted bg for contrast */}
                      <td className={cn('px-1 py-1.5 text-right tabular-nums truncate bg-orange-50/60 text-[9px]', numCls(row.chiPhiT, medians.cp))}>{fmtCP(row.chiPhiT)}</td>
                      <td className={cn('px-1 py-1.5 text-right tabular-nums truncate bg-orange-50/60', numCls(row.slDataT, medians.sl))}>{fmtSL(row.slDataT)}</td>
                      <td className={cn('px-1 py-1.5 text-right tabular-nums truncate bg-orange-50/60 text-[9px]', numCls(row.cplT, medians.cpl, true))}>{fmtCPL(row.cplT)}</td>
                      <td className={cn('px-1 py-1.5 text-right tabular-nums truncate bg-orange-50/60', numCls(row.roasT, medians.roas))}>{fmtRoas(row.roasT)}</td>
                      <td className={cn('px-1 py-1.5 text-right tabular-nums truncate', numCls(row.cldt, medians.cldt))}>{fmtCldt(row.cldt)}</td>

                      {/* SOP badge */}
                      <td className="px-1 py-1.5 overflow-hidden">
                        {vs ? (
                          <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-semibold border whitespace-nowrap truncate', vs.bg, vs.text, vs.border)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', vs.dot)} />
                            {vs.short}
                          </span>
                        ) : <span className="text-gray-300">–</span>}
                      </td>

                      {/* Người Chạy */}
                      <td className="px-1 py-1.5 overflow-hidden">
                        {!runners.length ? <span className="text-gray-300 text-[9px]">-</span> : (
                          <div className="flex flex-col gap-0.5">
                            {runners.map(r => (
                              <span key={r} className="px-1 py-0.5 bg-blue-50 text-blue-700 text-[8px] font-semibold rounded border border-blue-100 truncate block">{r}</span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Yêu Cầu (decision) */}
                      <td className="px-1 py-1.5 overflow-hidden">
                        <div className="space-y-0.5">
                          {!hasFormalDecision && (isCutSop || isConsiderSop) && role === 'admin' && row.trangThai === 'Đang chạy' && (
                            <button
                              onClick={() => handleDecide(row.tenContent, row.vung)}
                              className={cn('flex items-center gap-1 px-1 py-0.5 rounded border text-[8px] font-semibold transition-all w-full truncate',
                                isCutSop ? 'border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100' : 'border-orange-300 bg-orange-50 text-orange-600 hover:bg-orange-100')}
                            >
                              {isCutSop ? '✂ Y/cầu cắt' : '✂ Cân nhắc'}
                            </button>
                          )}
                          {hasFormalDecision && (
                            <div className="flex items-center gap-0.5 flex-wrap">
                              {isNonCompliant && <span className="text-[8px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-1 py-0.5 rounded whitespace-nowrap">⚠️Chưa TH</span>}
                              {isPending    && <span className="text-[8px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1 py-0.5 rounded whitespace-nowrap">⏳Chờ KT</span>}
                              {isComplied   && <span className="text-[8px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1 py-0.5 rounded whitespace-nowrap">✅Xong</span>}
                              <span className="text-[8px] text-gray-400 truncate">{decision.approvedBy?.split(' ').pop()} {decision.approvedAt?.slice(5)}</span>
                              {role === 'admin' && (
                                <button onClick={() => handleCancelDecide(row.tenContent, row.vung)} className="text-[8px] text-gray-300 hover:text-red-400 transition-colors" title="Hủy yêu cầu">✕</button>
                              )}
                            </div>
                          )}
                          {isEditing ? (
                            <input
                              autoFocus value={noteValue} onChange={e => setNoteValue(e.target.value)}
                              onBlur={() => { handleUpdateNote(row.tenContent, row.vung, noteValue); setEditingNote(null); }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { handleUpdateNote(row.tenContent, row.vung, noteValue); setEditingNote(null); }
                                if (e.key === 'Escape') setEditingNote(null);
                              }}
                              className="text-[8px] px-1 py-0.5 border border-blue-300 rounded w-full focus:outline-none"
                              placeholder="Ghi chú..."
                            />
                          ) : decision?.note ? (
                            <div onClick={() => { if (role === 'admin') { setEditingNote(docId); setNoteValue(decision.note || ''); } }} className="text-[8px] text-gray-600 bg-yellow-50 border border-yellow-100 rounded px-1 py-0.5 cursor-pointer hover:bg-yellow-100 truncate" title={decision.note}>{decision.note}</div>
                          ) : role === 'admin' ? (
                            <div onClick={() => { setEditingNote(docId); setNoteValue(''); }} className="text-[8px] text-gray-300 cursor-pointer hover:text-gray-400">+ ghi chú</div>
                          ) : null}
                        </div>
                      </td>

                      {/* Log */}
                      <td className="px-1 py-1.5 overflow-hidden">
                        {!decision ? <span className="text-gray-300 text-[9px]">—</span> : (
                          <div className="space-y-0.5 text-[8px] leading-snug">
                            <div className="text-gray-500 truncate">
                              <span className="font-semibold text-gray-700">YC:</span> {decision.approvedAt?.slice(5)}
                              <span className="text-gray-400 ml-1">({decision.approvedBy?.split(' ').pop()})</span>
                            </div>
                            {decision.approvedAt === todayStr && row.trangThai === 'Đang chạy' && (
                              <div className="font-semibold text-blue-500 truncate">⏳ Chờ xác nhận</div>
                            )}
                            {!stillRunning && (
                              <div className="font-semibold text-emerald-600 truncate">✅ Đã dừng</div>
                            )}
                            {decision.approvedAt !== todayStr && stillRunning && (
                              <div className="font-semibold text-orange-600 truncate">
                                ⚠️ Còn chạy {daysPast > 0 ? `(+${daysPast}N)` : ''}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[10px] text-gray-400 text-center pb-2">
          {filteredRows.length}/{tabRows.length} content · Màu số tháng hiện tại so với median: <span className="text-emerald-600 font-semibold">xanh = tốt hơn</span> · <span className="text-rose-600 font-semibold">đỏ = kém hơn</span> · Viền trái = mức SOP
        </p>
      </div>
    </div>
  );
};
