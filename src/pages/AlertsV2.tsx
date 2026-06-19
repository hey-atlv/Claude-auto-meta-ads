import React, { useState, useMemo } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ChevronUp, ChevronDown, ChevronsUpDown, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useSheetsData } from '../contexts/SheetsDataContext';
import { getSopStatus } from '../lib/sopEvaluator';
import { formatVND, formatInteger } from '../lib/formatUtils';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

// ─── helpers ─────────────────────────────────────────────────────────────────
const kyToMonth = (ky: string) => {
  if (!ky.startsWith('thang')) return null;
  return parseInt(ky.replace('thang', ''), 10);
};
const monthLabel = (m: number) => `T${m}`;

const getPrevKys = (ky: string): [string | null, string | null] => {
  const m = kyToMonth(ky);
  if (!m) return [null, null];
  return [m > 1 ? `thang${m - 1}` : null, m > 2 ? `thang${m - 2}` : null];
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
  'Tầng 3 - Scale':    { bg:'bg-emerald-50', text:'text-emerald-700', border:'border-emerald-300', dot:'bg-emerald-500', short:'Scale',    left:'border-l-emerald-500' },
  'Tầng 3 - Giữ':     { bg:'bg-blue-50',    text:'text-blue-700',    border:'border-blue-300',    dot:'bg-blue-500',    short:'Giữ',      left:'border-l-blue-400' },
  'Tầng 3 - Cân nhắc':{ bg:'bg-orange-50',  text:'text-orange-700',  border:'border-orange-300',  dot:'bg-orange-400',  short:'Cân nhắc', left:'border-l-orange-400' },
  'Tầng 3 - Cắt bỏ':  { bg:'bg-rose-50',    text:'text-rose-700',    border:'border-rose-300',    dot:'bg-rose-500',    short:'Cắt bỏ',   left:'border-l-rose-500' },
  'Tầng 2 - Cắt/Giảm':{ bg:'bg-amber-50',   text:'text-amber-700',   border:'border-amber-300',   dot:'bg-amber-400',   short:'T2 Cắt',   left:'border-l-amber-400' },
  'Tầng 1 - Cắt sớm': { bg:'bg-rose-50',    text:'text-rose-600',    border:'border-rose-200',    dot:'bg-rose-400',    short:'T1 Cắt',   left:'border-l-rose-300' },
};

const VERDICT_ORDER = ['Tầng 1 - Cắt sớm','Tầng 2 - Cắt/Giảm','Tầng 3 - Cắt bỏ','Tầng 3 - Cân nhắc','Tầng 3 - Giữ','Tầng 3 - Scale'];

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

// ─── default SOP config ───────────────────────────────────────────────────────
const DEFAULT_SOP_CONFIG = {
  trong_nuoc: { t1_mess_min:20, t1_tlcd_min:0.5, t1_cpl_max:500000,  t2_data_min:5, t2_cpl_max:250000, t2_cldt_min:5.0,  t3_data_min:30, t3_roas_scale:2.0, t3_roas_cut:1.0, t3_cldt_min:10.0 },
  nuoc_ngoai: { t1_mess_min:20, t1_tlcd_min:1.0, t1_cpl_max:1000000, t2_data_min:5, t2_cpl_max:600000, t2_cldt_min:10.0, t3_data_min:50, t3_roas_scale:2.5, t3_roas_cut:1.5, t3_cldt_min:20.0 },
};

// ─── main page ────────────────────────────────────────────────────────────────
export const AlertsV2 = () => {
  const { rawRows, contents, performance: allPerformance } = useSheetsData();

  const [alertTab,     setAlertTab]     = useState<'trong_nuoc'|'nuoc_ngoai'>('trong_nuoc');
  const [ky,           setKy]           = useState(`thang${new Date().getMonth() + 1}`);
  const [statusFilter, setStatusFilter] = useState<'all'|'running'|'off'>('running');
  const [verdictFilter,setVerdictFilter]= useState('Tất cả');
  const [sortKey,      setSortKey]      = useState<SortKey>('chiPhiT');
  const [sortDir,      setSortDir]      = useState<SortDir>('desc');

  const sopConfig = useMemo(() => {
    try { const s = localStorage.getItem('sopConfig'); return s ? { ...DEFAULT_SOP_CONFIG, ...JSON.parse(s) } : DEFAULT_SOP_CONFIG; }
    catch { return DEFAULT_SOP_CONFIG; }
  }, []);

  const [prevKy, prev2Ky] = useMemo(() => getPrevKys(ky), [ky]);
  const curM  = kyToMonth(ky);
  const prevM = prevKy  ? kyToMonth(prevKy)  : null;
  const p2M   = prev2Ky ? kyToMonth(prev2Ky) : null;

  // isRunning: max date per market across all months
  const maxDateND = useMemo(() => rawRows.reduce((max, r) => (r.market === 'Nội Địa'  && r.date > max) ? r.date : max, ''), [rawRows]);
  const maxDateVK = useMemo(() => rawRows.reduce((max, r) => (r.market === 'Việt Kiều' && r.date > max) ? r.date : max, ''), [rawRows]);

  // campaignMaxDate per (rootId_vung) from rawRows
  const campaignMaxMap = useMemo(() => {
    const matchAnyKy = (date: string) => {
      const kys = [ky, prevKy, prev2Ky].filter(Boolean) as string[];
      return kys.some(k => {
        const m = k.replace('thang', '').padStart(2, '0');
        return date.startsWith(`2026-${m}`);
      });
    };
    const map: Record<string, string> = {};
    rawRows.forEach(r => {
      if (!(r.spend > 0) || !r.campaign_name || !matchAnyKy(r.date)) return;
      const nums = (r.campaign_name as string).match(/(\d{4,})/g);
      if (!nums) return;
      const mk = r.market === 'Nội Địa' ? 'nd' : r.market === 'Việt Kiều' ? 'vk' : null;
      if (!mk) return;
      nums.forEach(n => {
        const key = `${n}_${mk}`;
        if (!map[key] || r.date > map[key]) map[key] = r.date;
      });
    });
    return map;
  }, [rawRows, ky, prevKy, prev2Ky]);

  // Build per-row data
  const rows = useMemo(() => {
    const byKy = (k: string | null) => k ? allPerformance.filter(p => p.ky === k) : [];
    const perfT  = byKy(ky);
    const perfP1 = byKy(prevKy);
    const perfP2 = byKy(prev2Ky);

    return perfT
      .filter(p => p.tenContent && /^\d{4,6}/.test(p.tenContent) && (p.chiPhi || 0) > 0)
      .map(p => {
        const vung = p.vung as 'trong_nuoc' | 'nuoc_ngoai';
        const c = contents.find(d => d.id === p.tenContent || d.docId === p.tenContent);
        const p1 = perfP1.find(x => x.tenContent === p.tenContent && x.vung === vung);
        const p2 = perfP2.find(x => x.tenContent === p.tenContent && x.vung === vung);

        const chiPhiT = p.chiPhi  || 0;
        const slDataT = p.slData  || 0;
        const cplT    = slDataT > 0 ? chiPhiT / slDataT : 0;
        const roasT   = (vung === 'trong_nuoc' ? p.roasTrong : p.roas3Thang) || 0;

        const chiPhiP1 = p1?.chiPhi || 0;
        const slDataP1 = p1?.slData || 0;
        const cplP1    = slDataP1 > 0 ? chiPhiP1 / slDataP1 : 0;

        const chiPhiP2 = p2?.chiPhi || 0;
        const slDataP2 = p2?.slData || 0;

        const rawCldt = vung === 'nuoc_ngoai' ? c?.cldt_nn_tich_cuc : c?.cldt_nd_tich_cuc;
        const cldt = rawCldt != null ? rawCldt * 100 : 0;

        // isRunning
        const rootId = p.tenContent.match(/^(\d{4,})/)?.[1] || null;
        const mk = vung === 'trong_nuoc' ? 'nd' : 'vk';
        const camMax = rootId ? (campaignMaxMap[`${rootId}_${mk}`] || '') : '';
        const tgtMax = vung === 'trong_nuoc' ? maxDateND : maxDateVK;
        let isRunning = false;
        if (tgtMax && camMax) {
          const diff = (new Date(tgtMax).getTime() - new Date(camMax).getTime()) / 86400000;
          isRunning = diff <= 1;
        }

        // SOP verdict (2T combined: current + prev)
        const sopRow = {
          messages: p.messages || 0,
          chiPhi: chiPhiT + chiPhiP1, slData: slDataT + slDataP1,
          chiPhiHT: chiPhiT, slDataHT: slDataT,
          chiPhiPrev: chiPhiP1, slDataPrev: slDataP1,
          cldt,
          roasTrong: p.roasTrong || 0, roas3Thang: p.roas3Thang || 0,
          roasTrongPrev: p1?.roasTrong || 0, roas3ThangPrev: p1?.roas3Thang || 0,
        };
        const sop = getSopStatus(sopRow, vung, sopConfig);

        const parts = p.tenContent.split('-');
        const displayName = parts.length > 1 ? parts.slice(1).join('-').trim() : p.tenContent;
        const code = parts[0];

        return { id: p.tenContent, displayName, code, vung, isRunning, chiPhiT, slDataT, cplT, roasT, chiPhiP1, slDataP1, cplP1, chiPhiP2, slDataP2, cldt, sop, sopLevel: sop?.level ?? null };
      });
  }, [allPerformance, contents, ky, prevKy, prev2Ky, sopConfig, campaignMaxMap, maxDateND, maxDateVK]);

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

  // number color relative to median (highIsBad: CPL)
  const numCls = (v: number, med: number, highIsBad = false) => {
    if (!v || !med) return 'text-gray-600';
    const ratio = v / med;
    if (highIsBad) return ratio > 1.3 ? 'text-rose-600 font-semibold' : ratio < 0.7 ? 'text-emerald-600 font-semibold' : 'text-gray-700';
    return ratio > 1.3 ? 'text-emerald-600 font-semibold' : ratio < 0.7 ? 'text-rose-600 font-semibold' : 'text-gray-700';
  };

  const kyOptions = [1,2,3,4,5,6,7,8,9,10,11,12].map(m => ({ value:`thang${m}`, label:`Tháng ${m}` }));

  const TH  = 'px-2 py-2 text-right text-[9px] font-bold uppercase tracking-wide text-gray-400 whitespace-nowrap cursor-pointer hover:text-blue-500 select-none';
  const THL = 'px-3 py-2 text-left  text-[9px] font-bold uppercase tracking-wide text-gray-400 whitespace-nowrap select-none';

  return (
    <div className="flex-1 overflow-y-auto bg-[#f0f2f7] min-h-screen custom-scrollbar">
      <div className="max-w-[1560px] mx-auto px-4 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-black tracking-tight text-gray-900 uppercase">
              Cảnh Báo Content <span className="text-blue-500">v2</span>
            </h1>
            <p className="text-[11px] text-gray-400 mt-0.5">Đa tháng · Sortable · Median reference · SOP verdict</p>
          </div>
          <select
            value={ky}
            onChange={e => setKy(e.target.value)}
            className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-800 outline-none shadow-sm cursor-pointer"
          >
            {kyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Tổng Chi Phí"  value={fmtCP(kpis.totalCP)}    accent="bg-orange-400" />
          <KpiCard label="Tổng SL Data"  value={fmtSL(kpis.totalSL)}    accent="bg-teal-500" />
          <KpiCard label="Median CPL"    value={fmtCPL(kpis.medCPL)}    accent="bg-blue-500" />
          <KpiCard label="Median ROAS"   value={fmtRoas(kpis.medROAS)}   accent="bg-teal-400" />
          <KpiCard label="Đang Chạy"     value={String(kpis.running)} sub={`/ ${kpis.total} content`} accent="bg-blue-500" />
          <KpiCard label="Cần Xem Xét"   value={String(kpis.needAction)} accent="bg-rose-500" />
        </div>

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
            <table className="w-full border-collapse" style={{ minWidth: 860, fontSize: '11px' }}>
              <thead>
                {/* Month group row */}
                <tr className="bg-[#f5f6fa] border-b border-gray-100">
                  <th className="px-3 py-1.5" colSpan={2} />
                  {p2M && (
                    <th colSpan={2} className="px-2 py-1 text-center text-[10px] font-bold text-blue-400 border-b-2 border-blue-200">
                      {monthLabel(p2M)}
                    </th>
                  )}
                  {prevM && (
                    <th colSpan={3} className="px-2 py-1 text-center text-[10px] font-bold text-teal-500 border-b-2 border-teal-300">
                      {monthLabel(prevM)}
                    </th>
                  )}
                  {curM && (
                    <th colSpan={4} className="px-2 py-1 text-center text-[10px] font-bold text-orange-500 border-b-2 border-orange-400">
                      {monthLabel(curM)} ◀ Hiện tại
                    </th>
                  )}
                  <th colSpan={2} />
                </tr>
                {/* Column names row */}
                <tr className="bg-[#f5f6fa] border-b-2 border-gray-200">
                  <th className={THL}>Content</th>
                  <th className={THL}>Trạng thái</th>
                  {p2M && <>
                    <th className={TH} onClick={() => handleSort('chiPhiP2')}>CP <SortIcon col="chiPhiP2" sortKey={sortKey} sortDir={sortDir} /></th>
                    <th className={TH} onClick={() => handleSort('slDataP2')}>SL <SortIcon col="slDataP2" sortKey={sortKey} sortDir={sortDir} /></th>
                  </>}
                  {prevM && <>
                    <th className={TH} onClick={() => handleSort('chiPhiP1')}>CP <SortIcon col="chiPhiP1" sortKey={sortKey} sortDir={sortDir} /></th>
                    <th className={TH} onClick={() => handleSort('slDataP1')}>SL <SortIcon col="slDataP1" sortKey={sortKey} sortDir={sortDir} /></th>
                    <th className={TH} onClick={() => handleSort('cplP1')}>CPL <SortIcon col="cplP1" sortKey={sortKey} sortDir={sortDir} /></th>
                  </>}
                  <th className={TH} onClick={() => handleSort('chiPhiT')}>CP <SortIcon col="chiPhiT" sortKey={sortKey} sortDir={sortDir} /></th>
                  <th className={TH} onClick={() => handleSort('slDataT')}>SL <SortIcon col="slDataT" sortKey={sortKey} sortDir={sortDir} /></th>
                  <th className={TH} onClick={() => handleSort('cplT')}>CPL <SortIcon col="cplT" sortKey={sortKey} sortDir={sortDir} /></th>
                  <th className={TH} onClick={() => handleSort('roasT')}>ROAS <SortIcon col="roasT" sortKey={sortKey} sortDir={sortDir} /></th>
                  <th className={TH} onClick={() => handleSort('cldt')}>CLDT <SortIcon col="cldt" sortKey={sortKey} sortDir={sortDir} /></th>
                  <th className={THL}>SOP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.length === 0 && (
                  <tr><td colSpan={99} className="py-16 text-center text-gray-400">Không có dữ liệu phù hợp</td></tr>
                )}
                {filteredRows.map(row => {
                  const vs = row.sopLevel ? VERDICT_STYLES[row.sopLevel] : null;
                  return (
                    <tr key={row.id} className={cn('border-l-[3px] hover:bg-gray-50/70 transition-colors', vs ? vs.left : 'border-l-gray-100')}>
                      {/* Content */}
                      <td className="px-3 py-2.5 max-w-[190px]">
                        <div className="font-semibold text-[11.5px] text-gray-800 truncate leading-tight">{row.displayName}</div>
                        <div className="text-[9.5px] text-gray-400 font-mono mt-0.5">{row.code}</div>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2.5">
                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border',
                          row.isRunning ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'
                        )}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', row.isRunning ? 'bg-emerald-500' : 'bg-gray-400')} />
                          {row.isRunning ? 'Chạy' : 'Tắt'}
                        </span>
                      </td>

                      {/* T-2 */}
                      {p2M && <>
                        <td className="px-2 py-2.5 text-right tabular-nums text-gray-400">{fmtCP(row.chiPhiP2)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-gray-400">{fmtSL(row.slDataP2)}</td>
                      </>}

                      {/* T-1 */}
                      {prevM && <>
                        <td className="px-2 py-2.5 text-right tabular-nums text-gray-500">
                          {fmtCP(row.chiPhiP1)}<DeltaArrow curr={row.chiPhiT} prev={row.chiPhiP1} />
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-gray-500">{fmtSL(row.slDataP1)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-gray-500">{fmtCPL(row.cplP1)}</td>
                      </>}

                      {/* T current — colored vs median */}
                      <td className={cn('px-2 py-2.5 text-right tabular-nums', numCls(row.chiPhiT, medians.cp))}>{fmtCP(row.chiPhiT)}</td>
                      <td className={cn('px-2 py-2.5 text-right tabular-nums', numCls(row.slDataT, medians.sl))}>{fmtSL(row.slDataT)}</td>
                      <td className={cn('px-2 py-2.5 text-right tabular-nums', numCls(row.cplT, medians.cpl, true))}>{fmtCPL(row.cplT)}</td>
                      <td className={cn('px-2 py-2.5 text-right tabular-nums', numCls(row.roasT, medians.roas))}>{fmtRoas(row.roasT)}</td>
                      <td className={cn('px-2 py-2.5 text-right tabular-nums', numCls(row.cldt, medians.cldt))}>{fmtCldt(row.cldt)}</td>

                      {/* SOP badge */}
                      <td className="px-3 py-2.5">
                        {vs ? (
                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap', vs.bg, vs.text, vs.border)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', vs.dot)} />
                            {vs.short}
                          </span>
                        ) : <span className="text-gray-300">–</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[10px] text-gray-400 text-center pb-2">
          {filteredRows.length}/{tabRows.length} content · Màu số tháng hiện tại so với median: <span className="text-emerald-600 font-semibold">xanh = tốt hơn</span> · <span className="text-rose-600 font-semibold">đỏ = kém hơn</span>
        </p>
      </div>
    </div>
  );
};
