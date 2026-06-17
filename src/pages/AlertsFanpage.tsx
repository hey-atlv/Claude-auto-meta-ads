import React, { useState, useMemo, useEffect, useRef } from "react";
import { useSheetsData } from "../contexts/SheetsDataContext";
import {
  formatRoas,
  formatPercent,
  formatVND,
} from "../lib/formatUtils";
import {
  Search,
  X,
  FilterX,
  Bot,
  Copy,
  Check,
  Settings2,
} from "lucide-react";
import {
  getFanpageVerdict,
  defaultFanpageConfig,
  type FanpageConfig,
} from "../lib/fanpageEvaluator";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { dummyFanpages, FanpageData } from "../data/fanpageDummyData";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../firebase";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const getPrevMonthKey = (selected: string): string | null => {
  if (selected === "all" || selected === "T1") return null;
  const n = parseInt(selected.slice(1), 10);
  return isNaN(n) ? null : `T${n - 1}`;
};

type MiniMetric = { roas: number | null; sl: number; cp: number | null; gd: number | null; roas3m?: number | null };

const TrendBadge = ({
  curr, prev, field,
}: {
  curr: number | null; prev: number | null; field: "roas" | "cp" | "cpl" | "sl";
}) => {
  if (curr == null || prev == null || prev === 0) return null;
  const pct = (curr - prev) / Math.abs(prev);
  const betterWhenHigher = field === "roas" || field === "sl";
  const improving = betterWhenHigher ? pct > 0.03 : pct < -0.03;
  const worsening = betterWhenHigher ? pct < -0.03 : pct > 0.03;
  const arrow = improving ? "↑" : worsening ? "↓" : "→";
  const color = improving ? "text-[#1D9E75]" : worsening ? "text-[#E24B4A]" : "text-gray-400";
  return (
    <span className={cn("font-bold", color)}>
      {arrow} {`${pct >= 0 ? "+" : ""}${Math.round(pct * 100)}%`}
    </span>
  );
};

const MetricCell = ({
  curr, prev, prevLabel, field, formatFn, currClass,
}: {
  curr: number | null; prev: number | null; prevLabel: string | null;
  field: "roas" | "cp" | "cpl" | "sl";
  formatFn: (v: number | null) => string;
  currClass?: string;
}) => (
  <div className="text-right">
    <div className={cn("font-semibold tabular-nums", currClass ?? "text-gray-800")}>
      {formatFn(curr)}
    </div>
    {prevLabel && (prev != null && prev !== 0) && (
      <div className="text-[10px] text-gray-400 mt-0.5">
        {prevLabel}: {formatFn(prev)} <TrendBadge curr={curr} prev={prev} field={field} />
      </div>
    )}
  </div>
);

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <button
      onClick={handleCopy}
      className="p-1 hover:bg-gray-100 rounded-md transition-colors text-gray-400 hover:text-gray-600 focus:outline-none"
      title="Copy tên/mã"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-500" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
};

const removeVietnameseTones = (str: string): string => {
  if (!str) return "";
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
  str = str.replace(/đ/g, "d");
  str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
  str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
  str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
  str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ề|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
  str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
  str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
  str = str.replace(/Đ/g, "D");
  str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, "");
  str = str.replace(/\u02C6|\u0306|\u031B/g, "");
  return str;
};

const normalizeCode = (s: string) => (s || "").toLowerCase().replace(/[\s\-_]/g, "");

// Chuẩn hoá spacing quanh dấu "-" về dạng " - " để copy button luôn cho ra
// chuỗi khớp khi tìm kiếm trong Google Sheets (tránh "ME- F" vs "ME - F").
const normalizeSourceCode = (s: string) =>
  (s || "").replace(/\s*-\s*/g, " - ").replace(/\s+/g, " ").trim();


const getStatusBadgeColor = (status: string) => {
  const s = status?.toLowerCase().trim() || "";
  if (s.includes("đang chạy"))
    return "bg-green-100 text-green-800 border-green-200";
  if (s.includes("hủy đăng"))
    return "bg-gray-100 text-gray-800 border-gray-200";
  if (s.includes("hcqc")) return "bg-red-100 text-red-800 border-red-200";
  if (s.includes("đã setup"))
    return "bg-blue-100 text-blue-800 border-blue-200";
  if (s.includes("đào data"))
    return "bg-yellow-100 text-yellow-800 border-yellow-200";
  if (s.includes("nhập kho"))
    return "bg-purple-100 text-purple-800 border-purple-200";
  return "bg-gray-100 text-gray-800 border-gray-200";
};

const getStatusDotColor = (status: string) => {
  const s = status?.toLowerCase().trim() || "";
  if (s.includes("đang chạy")) return "bg-green-500";
  if (s.includes("hủy đăng")) return "bg-gray-500";
  if (s.includes("hcqc")) return "bg-red-500";
  if (s.includes("đã setup")) return "bg-blue-500";
  if (s.includes("đào data")) return "bg-yellow-500";
  if (s.includes("nhập kho")) return "bg-purple-500";
  return "bg-gray-500";
};

export const AlertsFanpage = () => {
  const { rawRows, roasPage, fanpagesMap, isLoading: isSheetsLoading } = useSheetsData();
  const [firestoreFanpages, setFirestoreFanpages] = useState<any[]>([]);
  const [isDbLoading, setIsDbLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "fanpages"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data: any[] = [];
        snapshot.forEach((doc) => {
          data.push(doc.data());
        });
        setFirestoreFanpages(data);
        setIsDbLoading(false);
      },
      (error) => {
        console.error("Error fetching fanpages in Alerts:", error);
        setIsDbLoading(false);
      },
    );
    return () => unsubscribe();
  }, []);

  const isLoading = isSheetsLoading || isDbLoading;

  const [fanpageConfig, setFanpageConfig] = useState<FanpageConfig>(() => {
    try {
      const saved = localStorage.getItem("fanpageConfig");
      return saved ? { ...defaultFanpageConfig, ...JSON.parse(saved) } : defaultFanpageConfig;
    } catch { return defaultFanpageConfig; }
  });
  const [showConfig, setShowConfig] = useState(false);
  const [configTab, setConfigTab] = useState<"noi_dia" | "quoc_te">("noi_dia");

  const updateConfig = (market: "noi_dia" | "quoc_te", key: string, val: string) => {
    const num = parseFloat(val);
    if (isNaN(num)) return;
    setFanpageConfig((prev) => {
      const next = { ...prev, [market]: { ...prev[market], [key]: num } };
      localStorage.setItem("fanpageConfig", JSON.stringify(next));
      return next;
    });
  };

  const resetConfig = () => {
    setFanpageConfig(defaultFanpageConfig);
    localStorage.removeItem("fanpageConfig");
  };

  const [alertTab, setAlertTab] = useState<"noi_dia" | "quoc_te">("noi_dia");

  const [selectedMonth, setSelectedMonth] = useState("all");
  const [brandFilter, setBrandFilter] = useState("Tất cả");
  const [adFilter, setAdFilter] = useState("Tất cả");
  const [cgsdFilter, setCgsdFilter] = useState("Tất cả");
  const [typeFilter, setTypeFilter] = useState("Tất cả");
  const [verdictFilter, setVerdictFilter] = useState("Tất cả");
  const [searchQuery, setSearchQuery] = useState("");

  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Months with at least one Ads row enable their button; the most recent one
  // (current calendar month, possibly mid-month) gets the "Partial" badge.
  // Replaces the old hardcoded "only T1-T5 enabled" list, which silently hid
  // real synced data for any later month (e.g. June) once it became available.
  const monthsWithData = useMemo(() => {
    const set = new Set<number>();
    for (const r of rawRows) {
      if (!r.date) continue;
      const m = parseInt(r.date.substring(5, 7), 10);
      if (m >= 1 && m <= 12) set.add(m);
    }
    return set;
  }, [rawRows]);

  const latestMonthWithData = useMemo(() => {
    if (monthsWithData.size === 0) return null;
    return Math.max(...monthsWithData);
  }, [monthsWithData]);

  const monthsList = useMemo(() => {
    const list: { id: string; label: string; badge?: string; disabled?: boolean }[] = [
      { id: "all", label: "Tổng năm" },
    ];
    for (let m = 1; m <= 12; m++) {
      const hasData = monthsWithData.has(m);
      list.push({
        id: `T${m}`,
        label: `T${m}`,
        disabled: !hasData,
        badge: hasData && m === latestMonthWithData ? "Partial" : undefined,
      });
    }
    return list;
  }, [monthsWithData, latestMonthWithData]);

  // Default to the most recent month that actually has data, instead of a
  // hardcoded month — falls back to "all" only while data is still loading.
  useEffect(() => {
    if (latestMonthWithData !== null) {
      setSelectedMonth((prev) => (prev === "all" ? `T${latestMonthWithData}` : prev));
    }
  }, [latestMonthWithData]);

  // Configure exact filter options requested by user
  const brands = ["Tất cả", "MG", "S"];
  const ads = [
    "Tất cả",
    "Vũ Minh Hiếu",
    "Nguyễn Tiến Ánh",
    "Quản Cao Khiêm",
    "Nguyễn Thị Liên",
    "Đặng Thị Kim Anh",
    "Google",
  ];
  const cgsds = ["Tất cả", "Lại Minh Hiếu", "Thanh Xuân", "Khác"];
  const types = ["Tất cả", "Thương hiệu", "CGSĐ", "Google", "Miền Bắc"];

  // Authoritative per-page monthly metrics synced from the "Roas page" sheet
  // tab (server-cache roasPage.json) — keyed by normalized mã page (page_code).
  // This replaces the old approach of re-deriving cost/ROAS by fuzzy-matching
  // raw ads campaign_name strings, which silently dropped pages that didn't
  // match and zeroed out ROAS (no real "doanh thu" field in raw ads rows).
  type RoasPageEntry = {
    months: Record<
      string,
      { roas: number | null; sl: number; cp: number; gd: number; roas3m: number | null }
    >;
    year: { roas: number | null; sl: number; cp: number; gd: number; roas3m: number | null };
  };

  const roasPageEntries = useMemo(() => {
    // Real sheet data inconsistently includes the brand prefix ("S -"/"MG -")
    // in the entity label — group by exact normalized label first (most rows
    // for the same page share the same label), then resolve fanpages against
    // these via substring matching (see lookupRoasPage below) since ma_page
    // always has the prefix while the sheet sometimes doesn't.
    const byKey = new Map<string, { key: string; keyNoAccent: string; entry: RoasPageEntry }>();
    for (const row of roasPage || []) {
      if (row.vung !== "tong_cong") continue;
      const key = normalizeCode(row.tenPage);
      if (!key) continue;
      const keyNoAccent = removeVietnameseTones(key);
      const bucket =
        byKey.get(key) || {
          key,
          keyNoAccent,
          entry: {
            months: Object.fromEntries(
              Array.from({ length: 12 }, (_, i) => [
                `T${i + 1}`,
                { roas: null, sl: 0, cp: 0, gd: 0, roas3m: null },
              ]),
            ),
            year: { roas: null, sl: 0, cp: 0, gd: 0, roas3m: null },
          } as RoasPageEntry,
        };

      const metric = {
        roas: row.chiPhi > 0 ? row.roasTrong : null,
        sl: row.slData,
        cp: row.chiPhi,
        gd: row.giaTData,
        roas3m: row.chiPhi > 0 ? row.roas3Thang : null,
      };

      if (row.kyIndex === 0) {
        bucket.entry.year = metric;
      } else if (row.kyIndex >= 1 && row.kyIndex <= 12) {
        bucket.entry.months[`T${row.kyIndex}`] = metric;
      }

      byKey.set(key, bucket);
    }
    return Array.from(byKey.values());
  }, [roasPage]);

  const lookupRoasPage = (maPage: string): RoasPageEntry | undefined => {
    const code = normalizeCode(maPage);
    const codeNoAccent = removeVietnameseTones(code);
    if (!code) return undefined;

    const exact = roasPageEntries.find(
      (e) => e.key === code || e.keyNoAccent === codeNoAccent,
    );
    if (exact) return exact.entry;

    // Fallback: bidirectional substring match — either side may be the
    // truncated/shorter one (sheet label missing a trailing suffix like
    // "Việt Nam", or vice versa) — pick the longest match to avoid
    // short/ambiguous labels matching the wrong page.
    let best: { entry: RoasPageEntry; len: number } | null = null;
    for (const e of roasPageEntries) {
      const matches =
        code.includes(e.key) ||
        e.key.includes(code) ||
        codeNoAccent.includes(e.keyNoAccent) ||
        e.keyNoAccent.includes(codeNoAccent);
      const len = Math.min(code.length, e.key.length);
      if (matches && (!best || len > best.len)) {
        best = { entry: e.entry, len };
      }
    }
    return best?.entry;
  };

  const realFanpages = useMemo(() => {
    const makePage = (fp: any) => {
      const dummy = dummyFanpages.find(
        (d) =>
          d.ma_page.toLowerCase() === (fp.page_code || "").toLowerCase() ||
          d.id_page === fp.page_id,
      );
      const pageName = fp.page_name || fp.page_code || "";
      return {
        name: normalizeSourceCode(fp.source_code || dummy?.name || ""),
        ten_page: pageName || dummy?.ten_page || "",
        ma_page: fp.page_code || dummy?.ma_page || "",
        id_page: fp.page_id || dummy?.id_page || "",
        dia_ly: fp.geography || dummy?.dia_ly || "Nội địa",
        brand:
          dummy?.brand ||
          ((fp.page_code || "").startsWith("MG") ? "G" : "S"),
        ten_ad: fp.runner || dummy?.ten_ad || "Khác",
        cgsd:
          dummy?.cgsd ||
          (pageName.includes("Thanh Xuân") ? "Thanh Xuân" : "Lại Minh Hiếu"),
        kenh: dummy?.kenh || "Thương hiệu",
        phan_loai: fp.type || fp.page_type || dummy?.phan_loai || "CGSĐ",
        trang_thai: fp.status || dummy?.trang_thai || "Đang chạy",
        year_sl: 0,
        year_cp: null as number | null,
        year_gd: null as number | null,
        year_roas: null as number | null,
        year_roas3m: null as number | null,
        months:
          dummy?.months ||
          Object.fromEntries(
            Array.from({ length: 12 }, (_, i) => [
              `T${i + 1}`,
              { roas: null, sl: 0, cp: null, gd: null, roas3m: null },
            ]),
          ),
        cldt: dummy?.cldt,
      };
    };

    // Build base from Firestore, then supplement with sheet fanpagesMap entries
    // that are not yet synced to Firestore (identified by page_code).
    let basePages: ReturnType<typeof makePage>[];
    if (firestoreFanpages.length > 0) {
      basePages = firestoreFanpages.map(makePage);
      const firestoreCodes = new Set(
        firestoreFanpages.map((fp) => (fp.page_code || "").toLowerCase()),
      );
      for (const fp of Object.values(fanpagesMap || {})) {
        if (fp && (fp as any).page_code && !firestoreCodes.has((fp as any).page_code.toLowerCase())) {
          basePages.push(makePage(fp as any));
        }
      }
    } else if (Object.keys(fanpagesMap || {}).length > 0) {
      basePages = Object.values(fanpagesMap).map((fp) => makePage(fp as any));
    } else {
      basePages = dummyFanpages.map((fp) => makePage(fp as any));
    }

    if (!rawRows || rawRows.length === 0) {
      return basePages;
    }

    // Performance: isRowMatchPage() re-runs removeVietnameseTones (20 chained
    // regex replaces) for every (row, page) pair — at ~28k rows × ~20 pages
    // that's 500k+ pairs and millions of regex ops, the real source of the
    // page lag. Precompute each row's and each page's normalized strings ONCE
    // and reuse them — the matching/tie-break logic itself is unchanged.
    const normalize = (s: string) => (s || "").toLowerCase().replace(/[\s\-_]/g, "");

    const pageMeta = basePages.map((page) => {
      const maPageNorm = normalize(page.ma_page).trim();
      const nameNorm = normalize(page.name);
      return {
        page,
        maPageNorm,
        maPageNoAccent: removeVietnameseTones(maPageNorm),
        nameNorm,
        nameNoAccent: removeVietnameseTones(nameNorm),
        idPageNorm: normalize(page.id_page),
      };
    });

    const rowMetaMap = new Map<any, { cleanRowCode: string; cleanRowNoAccent: string; normCampaign: string; normCampNoAccent: string }>();
    rawRows.forEach((r) => {
      if (!r.campaign_name) return;
      const cleanRowCode = r.page_code
        ? normalize(r.page_code.toLowerCase().replace(/-\s*(tq|nn|mb|mn|mt)$/i, "")).trim()
        : "";
      rowMetaMap.set(r, {
        cleanRowCode,
        cleanRowNoAccent: cleanRowCode ? removeVietnameseTones(cleanRowCode) : "",
        normCampaign: normalize(r.campaign_name.toLowerCase()),
        normCampNoAccent: removeVietnameseTones(normalize(r.campaign_name.toLowerCase())),
      });
    });

    // 1. Pre-match every row to all compatible pages to bypass O(N^2) inner looping during filtering
    const rowToMatchedPagesMap = new Map<any, any[]>();
    rowMetaMap.forEach((rm, r) => {
      const matched: any[] = [];
      for (const pm of pageMeta) {
        if (rm.cleanRowCode && pm.maPageNorm) {
          if (rm.cleanRowCode === pm.maPageNorm || rm.cleanRowNoAccent === pm.maPageNoAccent) {
            matched.push(pm.page);
            continue;
          }
        }
        if (
          (pm.maPageNorm && (rm.normCampaign.includes(pm.maPageNorm) || rm.normCampNoAccent.includes(pm.maPageNoAccent))) ||
          (pm.nameNorm && (rm.normCampaign.includes(pm.nameNorm) || rm.normCampNoAccent.includes(pm.nameNoAccent))) ||
          (pm.idPageNorm && rm.normCampaign.includes(pm.idPageNorm))
        ) {
          matched.push(pm.page);
        }
      }
      if (matched.length > 0) rowToMatchedPagesMap.set(r, matched);
    });

    // 2. Perform safe, 100% correct matching based on original business logic
    return basePages.map((page) => {
      // Prefer the authoritative "Roas page" sheet sync over the fuzzy
      // ads-campaign-name matching below — skips it entirely when matched.
      // page.name (Firestore source_code) carries the long descriptive label
      // ("S - CGSĐ - Ánh - F - ME- F - ...") that matches the sheet's "Tên
      // content" column format — page.ma_page is a short code (e.g. "Ánh
      // S02") and never matches.
      const sheetMatch = lookupRoasPage(page.name) || lookupRoasPage(page.ma_page);
      if (sheetMatch) {
        return {
          ...page,
          year_sl: sheetMatch.year.sl,
          year_cp: sheetMatch.year.cp,
          year_gd: sheetMatch.year.gd,
          year_roas: sheetMatch.year.roas,
          year_roas3m: sheetMatch.year.roas3m,
          months: sheetMatch.months,
        };
      }

      const pageRows = rawRows.filter((r) => {
        if (!r.campaign_name) return false;

        const matchedOthersAndSelf = rowToMatchedPagesMap.get(r);
        if (
          !matchedOthersAndSelf ||
          !matchedOthersAndSelf.some(
            (p) => p.ma_page === page.ma_page && p.name === page.name,
          )
        ) {
          return false;
        }

        const normCamp = rowMetaMap.get(r)!.normCampaign;
        const matchedOthers = matchedOthersAndSelf.filter((other) => {
          if (other.ma_page === page.ma_page && other.name === page.name)
            return false;
          return true;
        });

        if (matchedOthers.length > 0) {
          for (const other of matchedOthers) {
            const otherMaNorm = other.ma_page ? normalize(other.ma_page.toLowerCase()) : "";
            const currMaNorm = page.ma_page ? normalize(page.ma_page.toLowerCase()) : "";

            const otherMaMatched =
              otherMaNorm && normCamp.includes(otherMaNorm);
            const currMaMatched = currMaNorm && normCamp.includes(currMaNorm);

            if (otherMaMatched && !currMaMatched) {
              return false;
            }
            if (otherMaMatched && currMaMatched) {
              if (other.ma_page.length > page.ma_page.length) return false;
            }

            if (
              other.name &&
              page.name &&
              normCamp.includes(normalize(other.name.toLowerCase())) &&
              normCamp.includes(normalize(page.name.toLowerCase()))
            ) {
              if (other.name.length > page.name.length) {
                return false;
              }
            }
          }
        }

        return true;
      });

      // 3. Precompute months object T1 to T5/T12 in a single fast loop
      const months: Record<
        string,
        {
          roas: number | null;
          sl: number;
          cp: number | null;
          gd: number | null;
          roas3m?: number | null;
        }
      > = {};

      const monthlyBuckets: Record<
        number,
        { data_platform: number; spend: number; revenue: number }
      > = {};
      for (let i = 1; i <= 12; i++) {
        monthlyBuckets[i] = { data_platform: 0, spend: 0, revenue: 0 };
      }

      let yearLeads = 0;
      let yearSpend = 0;
      let yearRevenue = 0;

      pageRows.forEach((r) => {
        if (!r.date) return;
        const m = parseInt(r.date.substring(5, 7));
        if (m >= 1 && m <= 12) {
          const spend = r.actualSpend || r.spend || 0;
          const data_platform = r.purchases || 0; // SĐT thô từ ads
          const revenue = r.revenue || 0;

          monthlyBuckets[m].data_platform += data_platform;
          monthlyBuckets[m].spend += spend;
          monthlyBuckets[m].revenue += revenue;

          yearLeads += data_platform;
          yearSpend += spend;
          yearRevenue += revenue;
        }
      });

      for (let i = 1; i <= 12; i++) {
        const mKey = "T" + i;
        const bucket = monthlyBuckets[i];

        const mRoas = bucket.spend > 0 ? bucket.revenue / bucket.spend : null;
        const mCpl = bucket.data_platform > 0 ? bucket.spend / bucket.data_platform : 0;

        let sumRevenue3M = bucket.revenue;
        let sumSpend3M = bucket.spend;

        if (i - 1 >= 1) {
          sumRevenue3M += monthlyBuckets[i - 1].revenue;
          sumSpend3M += monthlyBuckets[i - 1].spend;
        }
        if (i - 2 >= 1) {
          sumRevenue3M += monthlyBuckets[i - 2].revenue;
          sumSpend3M += monthlyBuckets[i - 2].spend;
        }

        const mRoas3m = sumSpend3M > 0 ? sumRevenue3M / sumSpend3M : null;

        months[mKey] = {
          roas: mRoas,
          sl: bucket.data_platform,
          cp: bucket.spend,
          gd: mCpl,
          roas3m: mRoas3m,
        };
      }

      const yearRoas = yearSpend > 0 ? yearRevenue / yearSpend : null;
      const yearCpl = yearLeads > 0 ? yearSpend / yearLeads : 0;
      const yearRoas3m = months["T5"]?.roas3m || null;

      return {
        ...page,
        year_sl: yearLeads,
        year_cp: yearSpend,
        year_gd: yearCpl,
        year_roas: yearRoas,
        year_roas3m: yearRoas3m,
        months,
      };
    });
  }, [rawRows, firestoreFanpages, fanpagesMap, roasPageEntries]);

  const hiddenInactiveCountRef = useRef(0);

  const filteredData = useMemo(() => {
    let hiddenInactiveCount = 0;
    const result = realFanpages
      .map((p) => {
        const metrics =
          selectedMonth === "all"
            ? {
                roas: p.year_roas,
                sl: p.year_sl,
                cp: p.year_cp,
                gd: p.year_gd,
                roas3m: p.year_roas3m,
              }
            : p.months[selectedMonth] || {
                roas: null,
                sl: 0,
                cp: 0,
                gd: 0,
                roas3m: null,
              };
        const prevMonthKey = getPrevMonthKey(selectedMonth);
        const prevMetrics: MiniMetric = prevMonthKey
          ? p.months[prevMonthKey] || { roas: null, sl: 0, cp: null, gd: null, roas3m: null }
          : { roas: null, sl: 0, cp: null, gd: null, roas3m: null };

        const v = getFanpageVerdict(
          p.trang_thai,
          p.dia_ly,
          metrics.cp ?? null,
          metrics.sl ?? 0,
          metrics.roas ?? null,
          metrics.roas3m ?? null,
          fanpageConfig,
        );

        return { ...p, verdict: v, metrics, prevMetrics, prevMonthKey };
      })
      .filter((p) => {
        if (brandFilter !== "Tất cả") {
          const b =
            brandFilter.startsWith("MG") || brandFilter === "G" ? "G" : "S";
          if (p.brand !== b) return false;
        }
        if (adFilter !== "Tất cả" && p.ten_ad !== adFilter) return false;
        if (cgsdFilter !== "Tất cả") {
          if (cgsdFilter === "Khác") {
            if (p.cgsd === "Lại Minh Hiếu" || p.cgsd === "Thanh Xuân")
              return false;
          } else {
            if (p.cgsd !== cgsdFilter) return false;
          }
        }
        if (typeFilter !== "Tất cả" && p.phan_loai !== typeFilter) return false;
        // Tab lọc địa lý
        if (alertTab === "noi_dia" && p.dia_ly === "Quốc tế") return false;
        if (alertTab === "quoc_te" && p.dia_ly !== "Quốc tế") return false;

        if (verdictFilter !== "Tất cả" && p.verdict.label !== verdictFilter)
          return false;
        if (
          searchQuery &&
          !p.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
          return false;

        // Ẩn các trang 'Đã tắt' hoặc 'Không có data' theo mặc định để màn hình sạch sẽ trừ khi người dùng chủ động chọn bộ lọc Verdict cụ thể
        if (
          (p.verdict.v === "nodata" || p.verdict.v === "off") &&
          verdictFilter === "Tất cả"
        ) {
          hiddenInactiveCount++;
          return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          a.verdict.order - b.verdict.order ||
          (b.metrics.cp || 0) - (a.metrics.cp || 0),
      );
    hiddenInactiveCountRef.current = hiddenInactiveCount;
    return result;
  }, [
    realFanpages,
    selectedMonth,
    brandFilter,
    adFilter,
    cgsdFilter,
    typeFilter,

    verdictFilter,
    searchQuery,
    fanpageConfig,
    alertTab,
  ]);

  // KPI Summary
  const activeCountFromManagement = useMemo(() => {
    return realFanpages.filter((p) => {
      if (brandFilter !== "Tất cả") {
        const b =
          brandFilter.startsWith("MG") || brandFilter === "G" ? "G" : "S";
        if (p.brand !== b) return false;
      }
      if (adFilter !== "Tất cả" && p.ten_ad !== adFilter) return false;
      if (cgsdFilter !== "Tất cả") {
        if (cgsdFilter === "Khác") {
          if (p.cgsd === "Lại Minh Hiếu" || p.cgsd === "Thanh Xuân")
            return false;
        } else {
          if (p.cgsd !== cgsdFilter) return false;
        }
      }
      if (typeFilter !== "Tất cả" && p.phan_loai !== typeFilter) return false;
      if (
        searchQuery &&
        !p.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;

      return p.trang_thai && p.trang_thai.toLowerCase().includes("đang chạy");
    }).length;
  }, [
    realFanpages,
    brandFilter,
    adFilter,
    cgsdFilter,
    typeFilter,

    searchQuery,
  ]);

  const kpis = useMemo(() => {
    let stop = 0, warn = 0, star = 0, watch = 0, keep = 0;
    filteredData.forEach((p) => {
      if (p.verdict.v === "stop") stop++;
      else if (p.verdict.v === "warn") warn++;
      else if (p.verdict.v === "star") star++;
      else if (p.verdict.v === "watch") watch++;
      else if (p.verdict.v === "keep") keep++;
    });
    return { active: activeCountFromManagement, stop, warn, star, watch, keep };
  }, [filteredData, activeCountFromManagement]);

  const resetFilters = () => {
    setBrandFilter("Tất cả");
    setAdFilter("Tất cả");
    setCgsdFilter("Tất cả");
    setTypeFilter("Tất cả");

    setVerdictFilter("Tất cả");
    setSearchQuery("");
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 bg-[#F4F4F5]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#F47D6B]"></div>
          <p className="text-gray-500 font-medium font-bold text-[#15224B]">
            Đang phân tích dữ liệu & cảnh báo Fanpage...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#F4F4F5] p-4 lg:p-6 custom-scrollbar">
      <div className="max-w-[1400px] mx-auto space-y-4">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-[#15224B] tracking-tight">Cảnh Báo Fanpage</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Seryn Clinic · <span className="font-semibold text-[#15224B]">{kpis.active}</span> fanpage đang chạy
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowConfig((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors",
                showConfig ? "bg-[#15224B] text-white border-[#15224B]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400",
              )}
            >
              <Settings2 className="w-3.5 h-3.5" /> Ngưỡng
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F47D6B] hover:bg-[#e06755] text-white text-sm font-semibold rounded-lg transition-colors">
              <Bot className="w-3.5 h-3.5" /> Tư vấn AI
            </button>
          </div>
        </div>

        {/* ── Config Panel ── */}
        {showConfig && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-[#15224B] text-sm">Cấu hình ngưỡng cảnh báo</h2>
                <p className="text-xs text-gray-400 mt-0.5">Nội địa / Quốc tế — Lưu tự động vào trình duyệt.</p>
              </div>
              <button onClick={resetConfig} className="text-xs text-red-500 hover:text-red-700 font-medium underline">Đặt lại mặc định</button>
            </div>
            <div className="flex gap-2 border-b border-gray-100">
              {(["noi_dia", "quoc_te"] as const).map((tab) => (
                <button key={tab} onClick={() => setConfigTab(tab)}
                  className={cn("px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors",
                    configTab === tab ? "bg-[#15224B] text-white" : "text-gray-500 hover:text-[#15224B]")}>
                  {tab === "noi_dia" ? "🇻🇳 Nội địa" : "🌐 Quốc tế"}
                </button>
              ))}
            </div>
            {(["noi_dia", "quoc_te"] as const).map((market) =>
              configTab !== market ? null : (
                <div key={market} className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {([
                    { key: "t1_cp_max", label: "Tầng 1 CP max (VND)", hint: "Dưới → Theo dõi" },
                    { key: "t2_cp_max", label: "Tầng 2 CP max (VND)", hint: "Vượt → Tầng 3" },
                    { key: "roas_cut", label: "ROAS ngưỡng dừng (x)", hint: "Dưới + đủ SL → Dừng" },
                    { key: "roas_scale", label: "ROAS ngưỡng scale (x)", hint: "Đạt → Top Performer" },
                    { key: "roas_drop_pct", label: "% giảm ROAS cảnh báo", hint: "So ROAS 3T" },
                    { key: "sl_min_stop", label: "SL tối thiểu kết luận", hint: "Dưới chưa kết luận" },
                  ] as { key: keyof typeof fanpageConfig.noi_dia; label: string; hint: string }[]).map(({ key, label, hint }) => (
                    <div key={key} className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block">{label}</label>
                      <input type="number" step={["roas_cut","roas_scale","roas_drop_pct"].includes(key) ? "0.1" : "1"}
                        value={fanpageConfig[market][key]} onChange={(e) => updateConfig(market, key, e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium focus:border-[#F47D6B] focus:ring-1 focus:ring-[#F47D6B] outline-none" />
                      <p className="text-[10px] text-gray-400">{hint}</p>
                    </div>
                  ))}
                </div>
              )
            )}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 bg-gray-50 rounded-xl p-3 text-xs">
              {[
                { icon: "🔵", label: "Theo dõi", desc: "CP < T1" },
                { icon: "🟡", label: "Cần xem xét", desc: "ROAS thấp/giảm" },
                { icon: "🔴", label: "Dừng ngay", desc: "T3 + ROAS < ngưỡng" },
                { icon: "🟢", label: "Giữ lại", desc: "ROAS an toàn" },
                { icon: "⭐", label: "Top Performer", desc: "ROAS ≥ scale" },
              ].map(({ icon, label, desc }) => (
                <div key={label} className="flex items-start gap-1.5">
                  <span className="text-base leading-none">{icon}</span>
                  <div><p className="font-bold text-gray-700">{label}</p><p className="text-gray-400 mt-0.5">{desc}</p></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Month Selector ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-2 py-1.5 overflow-x-auto flex gap-1">
          {monthsList.map((m) => (
            <button key={m.id} disabled={m.disabled} onClick={() => setSelectedMonth(m.id)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap relative shrink-0",
                m.disabled ? "opacity-30 cursor-not-allowed text-gray-400"
                  : selectedMonth === m.id ? "bg-[#F47D6B] text-white shadow-sm"
                  : "text-gray-500 hover:bg-gray-100",
              )}>
              {m.label}
              {m.badge && (
                <span className={cn("absolute -top-1 -right-1 text-[8px] px-1 py-px rounded-full font-black leading-tight",
                  selectedMonth === m.id ? "bg-white text-[#F47D6B]" : "bg-[#F47D6B] text-white")}>
                  {m.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tabs + KPI row ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex bg-white rounded-xl p-1 border border-gray-200 shadow-sm">
            {([{ id: "noi_dia", label: "🇻🇳 Nội địa" }, { id: "quoc_te", label: "🌐 Nước ngoài" }] as const).map(({ id, label }) => (
              <button key={id} onClick={() => setAlertTab(id)}
                className={cn("px-5 py-1.5 text-sm font-semibold transition-all rounded-lg",
                  alertTab === id ? "bg-[#15224B] text-white shadow-sm" : "text-gray-500 hover:bg-gray-50")}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: "Active", count: kpis.active, cls: "bg-[#15224B]/5 text-[#15224B] border-[#15224B]/15" },
              { label: "🔴 Dừng", count: kpis.stop, cls: "bg-[#E24B4A]/10 text-[#E24B4A] border-[#E24B4A]/20" },
              { label: "🟡 Xem xét", count: kpis.warn, cls: "bg-[#BA7517]/10 text-[#BA7517] border-[#BA7517]/20" },
              { label: "🟢 Giữ lại", count: kpis.keep, cls: "bg-[#639922]/10 text-[#639922] border-[#639922]/20" },
              { label: "⭐ Top", count: kpis.star, cls: "bg-[#1D9E75]/10 text-[#1D9E75] border-[#1D9E75]/20" },
            ].map(({ label, count, cls }) => (
              <div key={label} className={cn("px-3 py-1 rounded-full border text-xs font-bold", cls)}>
                {label} <span className="font-black ml-0.5">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Filter Bar ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            {[
              { label: "Brand", value: brandFilter, set: setBrandFilter, opts: brands },
              { label: "AD", value: adFilter, set: setAdFilter, opts: ads },
              { label: "CGSĐ", value: cgsdFilter, set: setCgsdFilter, opts: cgsds },
              { label: "Loại", value: typeFilter, set: setTypeFilter, opts: types },
            ].map(({ label, value, set, opts }) => (
              <div key={label} className="flex-1 min-w-[100px]">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">{label}</label>
                <select value={value} onChange={(e) => set(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-700 bg-white focus:border-[#F47D6B] focus:ring-1 focus:ring-[#F47D6B] outline-none">
                  {opts.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <div className="flex-1 min-w-[140px]">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Tìm kiếm</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tên page..."
                  className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 focus:border-[#F47D6B] focus:ring-1 focus:ring-[#F47D6B] outline-none" />
              </div>
            </div>
            {(brandFilter !== "Tất cả" || adFilter !== "Tất cả" || cgsdFilter !== "Tất cả" || typeFilter !== "Tất cả" || verdictFilter !== "Tất cả" || searchQuery) && (
              <button onClick={resetFilters}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-200 rounded-lg transition-colors shrink-0">
                <FilterX className="w-3.5 h-3.5" /> Xóa lọc
              </button>
            )}
          </div>
          {/* Verdict chips */}
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-100">
            {[
              { v: "Tất cả",       label: "Tất cả",          cls: "bg-gray-100 text-gray-600" },
              { v: "Dừng ngay",    label: "🔴 Dừng ngay",    cls: "bg-[#E24B4A]/10 text-[#E24B4A]" },
              { v: "Cần xem xét",  label: "🟡 Cần xem xét",  cls: "bg-[#BA7517]/10 text-[#BA7517]" },
              { v: "Theo dõi",     label: "🔵 Theo dõi",     cls: "bg-[#378ADD]/10 text-[#378ADD]" },
              { v: "Giữ lại",      label: "🟢 Giữ lại",      cls: "bg-[#639922]/10 text-[#639922]" },
              { v: "Top performer",label: "⭐ Top Performer", cls: "bg-[#1D9E75]/10 text-[#1D9E75]" },
              { v: "Đã tắt",       label: "⚫ Đã tắt",       cls: "bg-gray-100 text-gray-500" },
              { v: "Không có data",label: "○ Chưa có data",  cls: "bg-gray-100 text-gray-400" },
            ].map(({ v, label, cls }) => (
              <button key={v} onClick={() => setVerdictFilter(v)}
                className={cn("px-2.5 py-1 rounded-full text-[11px] font-bold transition-all hover:opacity-100",
                  cls, verdictFilter === v ? "ring-2 ring-offset-1 ring-current opacity-100" : "opacity-60")}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Status line ── */}
        <p className="text-xs text-gray-400 px-1">
          {filteredData.length} fanpage đang hiển thị
          {hiddenInactiveCountRef.current > 0 && <span className="ml-1">· <span className="text-gray-300">{hiddenInactiveCountRef.current} bị ẩn (tắt / chưa có data)</span></span>}
        </p>

        {/* ── Empty state ── */}
        {filteredData.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center bg-white rounded-xl border border-gray-200">
            <FilterX className="w-10 h-10 text-gray-300 mb-3" />
            <h3 className="text-base font-bold text-gray-900 mb-1">Không có fanpage nào</h3>
            <p className="text-sm text-gray-500 mb-4">Thử thay đổi bộ lọc hoặc chọn tháng khác</p>
            <button onClick={resetFilters} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200">
              Xóa tất cả filter
            </button>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3 min-w-[260px]">Tên Page</th>
                    <th className="px-4 py-3 text-center min-w-[72px]">AD</th>
                    <th className="px-4 py-3 text-right min-w-[80px]">SĐT</th>
                    <th className="px-4 py-3 text-right min-w-[120px]">Chi phí</th>
                    <th className="px-4 py-3 text-right min-w-[110px]">CPL</th>
                    <th className="px-4 py-3 text-right min-w-[100px]">ROAS</th>
                    <th className="px-4 py-3 text-right min-w-[86px]">ROAS 3T</th>
                    <th className="px-4 py-3 text-center min-w-[120px]">Verdict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredData.map((page, idx) => (
                    <tr key={idx}
                      onClick={() => setExpandedRow(expandedRow === page.name ? null : page.name)}
                      className={cn(
                        "border-l-[3px] hover:bg-gray-50/80 cursor-pointer transition-colors",
                        page.verdict.v === "stop"  ? "border-l-[#E24B4A]"
                        : page.verdict.v === "warn"  ? "border-l-[#BA7517]"
                        : page.verdict.v === "star"  ? "border-l-[#1D9E75]"
                        : page.verdict.v === "keep"  ? "border-l-[#639922]"
                        : page.verdict.v === "watch" ? "border-l-[#378ADD]"
                        : "border-l-gray-200"
                      )}>
                      {/* Page name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", getStatusDotColor(page.trang_thai))} />
                          <span className="font-bold text-[#15224B] leading-snug">{page.ten_page}</span>
                          <CopyButton text={page.ten_page} />
                        </div>
                        <div className="text-[10px] text-gray-400 flex items-center gap-1 pl-3">
                          <span className="truncate max-w-[220px]" title={page.name}>{page.name}</span>
                          <CopyButton text={page.name} />
                        </div>
                        <div className="text-[10px] text-gray-300 mt-0.5 pl-3 flex gap-2">
                          {page.ma_page && <span>{page.ma_page}</span>}
                          {page.brand && <span className={cn("font-bold", page.brand === "G" ? "text-[#378ADD]/60" : "text-[#1D9E75]/60")}>{page.brand === "G" ? "MG" : "SC"}</span>}
                        </div>
                      </td>
                      {/* AD */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-medium text-gray-600">
                          {page.ten_ad ? page.ten_ad.split(" ").pop() : "—"}
                        </span>
                      </td>
                      {/* SĐT */}
                      <td className="px-4 py-3">
                        <MetricCell curr={page.metrics.sl > 0 ? page.metrics.sl : null}
                          prev={page.prevMetrics.sl > 0 ? page.prevMetrics.sl : null}
                          prevLabel={page.prevMonthKey} field="sl"
                          formatFn={(v) => v != null ? String(v) : "—"} />
                      </td>
                      {/* Chi phí */}
                      <td className="px-4 py-3">
                        <MetricCell curr={page.metrics.cp ?? null} prev={page.prevMetrics.cp ?? null}
                          prevLabel={page.prevMonthKey} field="cp" formatFn={formatVND} />
                      </td>
                      {/* CPL */}
                      <td className="px-4 py-3">
                        <MetricCell curr={page.metrics.gd ?? null} prev={page.prevMetrics.gd ?? null}
                          prevLabel={page.prevMonthKey} field="cpl" formatFn={formatVND} />
                      </td>
                      {/* ROAS */}
                      <td className="px-4 py-3">
                        <MetricCell curr={page.metrics.roas ?? null} prev={page.prevMetrics.roas ?? null}
                          prevLabel={page.prevMonthKey} field="roas"
                          formatFn={(v) => v != null ? formatRoas(v) : "—"}
                          currClass={page.metrics.roas != null && page.metrics.roas >= 2.5 ? "text-[#1D9E75]"
                            : page.metrics.roas != null && page.metrics.roas < 1.0 ? "text-[#E24B4A]" : "text-gray-800"} />
                      </td>
                      {/* ROAS 3T */}
                      <td className="px-4 py-3 text-right text-gray-500 font-medium tabular-nums">
                        {page.metrics.roas3m != null ? formatRoas(page.metrics.roas3m) : "—"}
                      </td>
                      {/* Verdict */}
                      <td className="px-4 py-3 text-center">
                        <span className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold inline-block w-full max-w-[108px] text-center", page.verdict.cls)}>
                          {page.verdict.label}
                        </span>
                        <p className="text-[10px] text-gray-400 mt-1 leading-tight line-clamp-2 max-w-[108px] mx-auto">
                          {page.verdict.reason}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Detail Panel ── */}
        {expandedRow && (
          <>
            <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setExpandedRow(null)} />
            <div className="fixed inset-x-0 bottom-0 z-50 bg-white border-t border-gray-200 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] max-h-[65vh] overflow-y-auto rounded-t-2xl" style={{ maxWidth: "1400px", margin: "0 auto" }}>
              {(() => {
                const page = filteredData.find((p) => p.name === expandedRow);
                if (!page) return null;
                return (
                  <div className="p-5">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={cn("px-2.5 py-1 rounded-lg text-xs font-bold", page.verdict.cls)}>
                            {page.verdict.label}
                          </span>
                          <span className="text-xs text-gray-400 italic">{page.verdict.reason}</span>
                        </div>
                        <h2 className="text-lg font-black text-[#15224B] flex items-center gap-1.5">
                          {page.ten_page} <CopyButton text={page.ten_page} />
                        </h2>
                        <div className="flex items-center gap-1 text-xs text-gray-400 mt-1 bg-gray-50 px-2 py-1 rounded-md w-fit">
                          <span className="font-mono truncate max-w-[400px]">{page.name}</span>
                          <CopyButton text={page.name} />
                        </div>
                      </div>
                      <button onClick={() => setExpandedRow(null)}
                        className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors shrink-0 ml-4">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    {/* KPI mini */}
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2.5 mb-4">
                      {[
                        { label: "SĐT", value: page.metrics.sl > 0 ? String(page.metrics.sl) : "—", cls: "text-gray-900" },
                        { label: "ROAS", value: page.metrics.roas != null ? formatRoas(page.metrics.roas) : "—",
                          cls: page.metrics.roas != null && page.metrics.roas >= 2 ? "text-[#1D9E75]" : page.metrics.roas != null && page.metrics.roas < 1 ? "text-[#E24B4A]" : "text-gray-900" },
                        { label: "ROAS 3T", value: page.metrics.roas3m != null ? formatRoas(page.metrics.roas3m) : "—", cls: "text-gray-600" },
                        { label: "Chi phí", value: formatVND(page.metrics.cp), cls: "text-gray-900" },
                        { label: "CPL", value: formatVND(page.metrics.gd), cls: "text-gray-900" },
                        { label: "AD", value: page.ten_ad || "—", cls: "text-gray-700" },
                      ].map(({ label, value, cls }) => (
                        <div key={label} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                          <p className="text-[10px] uppercase font-bold text-gray-400 mb-1">{label}</p>
                          <p className={cn("text-base font-black tabular-nums truncate", cls)}>{value}</p>
                        </div>
                      ))}
                    </div>
                    {/* Chart + CLDT */}
                    <div className="grid md:grid-cols-2 gap-5">
                      <div>
                        <h3 className="text-sm font-bold text-gray-700 mb-3">ROAS theo tháng</h3>
                        <div className="h-36">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={Array.from({ length: latestMonthWithData ?? 1 }, (_, i) => `T${i + 1}`).map((m) => ({
                              name: m, ROAS: page.months[m]?.roas || 0,
                            }))}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9CA3AF" }} />
                              <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9CA3AF" }} />
                              <RechartsTooltip cursor={{ fill: "#F9FAFB" }} />
                              <Bar yAxisId="left" dataKey="ROAS" fill="#378ADD" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-gray-700 mb-3">Chất lượng data (CLDT)</h3>
                        {page.cldt && page.cldt[selectedMonth === "all" ? `T${latestMonthWithData ?? 1}` : selectedMonth] ? (
                          (() => {
                            const cls = page.cldt[selectedMonth === "all" ? "T5" : selectedMonth];
                            return (
                              <div className="space-y-3">
                                {[
                                  { label: `Tích cực: ${cls.tc_sl}`, pct: cls.tc_pct, color: "bg-[#1D9E75]" },
                                  { label: `Tiêu cực: ${cls.neg_sl}`, pct: cls.neg_pct, color: "bg-[#E24B4A]" },
                                  { label: `Care giá: ${cls.care_sl}`, pct: cls.care_pct, color: "bg-[#BA7517]" },
                                ].map(({ label, pct, color }) => (
                                  <div key={label}>
                                    <div className="flex justify-between text-xs font-semibold text-gray-600 mb-1">
                                      <span>{label}</span><span>{formatPercent(pct)}</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                                      <div className={cn("h-1.5 rounded-full", color)} style={{ width: `${pct * 100}%` }} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()
                        ) : (
                          <p className="text-sm text-gray-400 italic text-center pt-8">Không có data CLDT</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
