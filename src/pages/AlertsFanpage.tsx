import React, { useState, useMemo, useEffect } from "react";
import { useSheetsData } from "../contexts/SheetsDataContext";
import {
  formatRatio,
  formatRoas,
  formatPercent,
  formatInteger,
  formatVND,
} from "../lib/formatUtils";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  X,
  BarChart3,
  Star,
  FilterX,
  Bot,
  Copy,
  Check,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import * as motion from "motion/react-client";
import { dummyFanpages, FanpageData } from "../data/fanpageDummyData";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../firebase";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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

const isRowMatchPage = (row: any, page: FanpageData) => {
  if (!row) return false;

  // 1. Kiểm tra bằng row.page_code trực tiếp trước tiên!
  const rowPageCode = row.page_code || "";
  if (rowPageCode && page.ma_page) {
    const cleanRowCode = rowPageCode.toLowerCase().replace(/-\s*(tq|nn|mb|mn|mt)$/i, "").replace(/[\s\-_]/g, "").trim();
    const cleanMaPage = page.ma_page.toLowerCase().replace(/[\s\-_]/g, "").trim();
    
    // So khớp thô không dấu phòng khi sai lệch dấu tiếng Việt
    const cleanRowNoAccent = removeVietnameseTones(cleanRowCode);
    const cleanMaNoAccent = removeVietnameseTones(cleanMaPage);

    if (cleanRowCode === cleanMaPage || cleanRowNoAccent === cleanMaNoAccent) {
      return true;
    }
  }

  // 2. Kiểm tra bằng raw campaign_name dự phòng
  const rowCampaignName = row.campaign_name || "";
  if (rowCampaignName) {
    const normCampaign = rowCampaignName.toLowerCase().replace(/[\s\-_]/g, "");

    // Check by page.ma_page (page code)
    if (page.ma_page) {
      const normMaPage = page.ma_page.toLowerCase().replace(/[\s\-_]/g, "");
      const normMaNoAccent = removeVietnameseTones(normMaPage);
      const normCampNoAccent = removeVietnameseTones(normCampaign);
      if (normCampaign.includes(normMaPage) || normCampNoAccent.includes(normMaNoAccent)) {
        return true;
      }
    }

    // Check by page.name
    if (page.name) {
      const normPageName = page.name.toLowerCase().replace(/[\s\-_]/g, "");
      const normNameNoAccent = removeVietnameseTones(normPageName);
      const normCampNoAccent = removeVietnameseTones(normCampaign);
      if (normCampaign.includes(normPageName) || normCampNoAccent.includes(normNameNoAccent)) {
        return true;
      }
    }

    // Check by id_page
    if (page.id_page) {
      const normIdPage = page.id_page.toLowerCase().replace(/[\s\-_]/g, "");
      if (normCampaign.includes(normIdPage)) return true;
    }
  }

  return false;
};

const getVerdict = (page: FanpageData, month: string) => {
  const isAll = month === "all";
  const data = isAll ? null : page.months[month];

  // 1. Kiểm tra trạng thái chung của trang
  const isPageStopped =
    page.trang_thai && !page.trang_thai.toLowerCase().includes("đang chạy");

  if (isPageStopped) {
    return {
      v: "off",
      label: "Đã tắt",
      cls: "bg-gray-400 text-white",
      reason: `Fanpage có trạng thái: ${page.trang_thai}`,
      order: 6,
    };
  }

  // 2. Kiểm tra nếu không chạy ads trong tháng (cp = 0 và sl = 0)
  if (!isAll) {
    if (!data) {
      return {
        v: "off",
        label: "Đã tắt",
        cls: "bg-gray-400 text-white",
        reason: "Không có dữ liệu chạy ads kỳ này",
        order: 6,
      };
    }
    const cp = data.cp ?? 0;
    const sl = data.sl ?? 0;
    if (cp === 0 && sl === 0) {
      return {
        v: "off",
        label: "Đã tắt",
        cls: "bg-gray-400 text-white",
        reason: "Không phát sinh chi phí quảng cáo trong tháng",
        order: 6,
      };
    }
  }

  const r = isAll ? page.year_roas : (data?.roas ?? null);
  const sl = isAll ? page.year_sl : (data?.sl ?? 0);
  const cp = isAll ? (page.year_cp ?? 0) : (data?.cp ?? 0);
  const r3 = isAll ? page.year_roas3m : (data?.roas3m ?? null);

  if (r === 0 && cp > 10_000_000)
    return {
      v: "stop",
      label: "Dừng ngay",
      cls: "bg-[#E24B4A] text-white",
      reason: "Chi phí >10M, ROAS = 0",
      order: 1,
    };

  if (r !== null && r < 0.5 && sl >= 20)
    return {
      v: "stop",
      label: "Dừng ngay",
      cls: "bg-[#E24B4A] text-white",
      reason: "ROAS < 0.5 với đủ volume",
      order: 1,
    };

  if (r !== null && r < 1.0 && sl >= 50)
    return {
      v: "warn",
      label: "Cần xem xét",
      cls: "bg-[#BA7517] text-white",
      reason: "ROAS dưới 1.0, data cao",
      order: 2,
    };

  if (r3 && r && r < r3 * 0.6)
    return {
      v: "warn",
      label: "Cần xem xét",
      cls: "bg-[#BA7517] text-white",
      reason: "ROAS đang giảm mạnh (>40%)",
      order: 2,
    };

  if (r !== null && r >= 2.5 && sl >= 30)
    return {
      v: "star",
      label: "Top performer",
      cls: "bg-[#1D9E75] text-white",
      reason: "ROAS ≥ 2.5, scale ngay",
      order: 5,
    };

  if (r !== null && r >= 1.0 && r < 2.5)
    return {
      v: "keep",
      label: "Giữ lại",
      cls: "bg-[#639922] text-white",
      reason: "ROAS trong ngưỡng an toàn",
      order: 4,
    };

  return {
    v: "watch",
    label: "Theo dõi",
    cls: "bg-[#378ADD] text-white",
    reason: "Data thấp hoặc biến động",
    order: 3,
  };
};

const getTrend = (page: FanpageData, currentMonth: string) => {
  const monthsArr = ["T1", "T2", "T3", "T4", "T5"];
  let validMonths: { m: string; roas: number }[] = [];

  for (const m of monthsArr) {
    if (
      currentMonth !== "all" &&
      m > currentMonth &&
      currentMonth.startsWith("T")
    )
      continue;
    const roas = page.months[m]?.roas;
    if (roas !== undefined && roas !== null && roas > 0) {
      validMonths.push({ m, roas });
    }
  }

  if (validMonths.length === 0)
    return { icon: Minus, color: "text-gray-400", label: "—" };
  if (validMonths.length === 1)
    return { icon: ArrowRight, color: "text-[#378ADD]", label: "New" };

  const last = validMonths[validMonths.length - 1].roas;
  const prev = validMonths[validMonths.length - 2].roas;

  if (prev === 0)
    return { icon: TrendingUp, color: "text-[#1D9E75]", label: "↑" };
  const ratio = last / prev;

  if (ratio > 1.15)
    return { icon: TrendingUp, color: "text-[#1D9E75]", label: "↑" };
  if (ratio < 0.8)
    return { icon: TrendingDown, color: "text-[#E24B4A]", label: "↓" };
  return { icon: ArrowRight, color: "text-gray-500", label: "→" };
};

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
  const { rawRows, isLoading: isSheetsLoading } = useSheetsData();
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

  const [selectedMonth, setSelectedMonth] = useState("T5");
  const [brandFilter, setBrandFilter] = useState("S");
  const [adFilter, setAdFilter] = useState("Tất cả");
  const [cgsdFilter, setCgsdFilter] = useState("Tất cả");
  const [typeFilter, setTypeFilter] = useState("Tất cả");
  const [verdictFilter, setVerdictFilter] = useState("Tất cả");
  const [diaLyFilter, setDiaLyFilter] = useState("Tất cả");
  const [searchQuery, setSearchQuery] = useState("");

  const [activeTab, setActiveTab] = useState("canh_bao");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const monthsList = [
    { id: "all", label: "Tổng năm" },
    { id: "T1", label: "T1" },
    { id: "T2", label: "T2" },
    { id: "T3", label: "T3" },
    { id: "T4", label: "T4" },
    { id: "T5", label: "T5", badge: "Partial" },
    { id: "T6", label: "T6", disabled: true },
    { id: "T7", label: "T7", disabled: true },
    { id: "T8", label: "T8", disabled: true },
    { id: "T9", label: "T9", disabled: true },
    { id: "T10", label: "T10", disabled: true },
    { id: "T11", label: "T11", disabled: true },
    { id: "T12", label: "T12", disabled: true },
  ];

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
  const dialys = ["Tất cả", "Nội địa", "Quốc tế", "Miền Bắc"];

  const realFanpages = useMemo(() => {
    const basePages =
      firestoreFanpages.length > 0
        ? firestoreFanpages.map((fp) => {
            const dummy = dummyFanpages.find(
              (d) =>
                d.ma_page.toLowerCase() === fp.page_code.toLowerCase() ||
                d.id_page === fp.page_id,
            );
            return {
              name: fp.source_code || dummy?.name || "",
              ten_page: fp.page_name || dummy?.ten_page || "",
              ma_page: fp.page_code || dummy?.ma_page || "",
              id_page: fp.page_id || dummy?.id_page || "",
              dia_ly: fp.geography || dummy?.dia_ly || "Nội địa",
              brand:
                dummy?.brand ||
                ((fp.page_code || "").startsWith("MG") ? "G" : "S"),
              ten_ad: fp.runner || dummy?.ten_ad || "Khác",
              cgsd:
                dummy?.cgsd ||
                (fp.page_name.includes("Thanh Xuân")
                   ? "Thanh Xuân"
                   : "Lại Minh Hiếu"),
              kenh: dummy?.kenh || "Thương hiệu",
              phan_loai: fp.page_type || dummy?.phan_loai || "CGSĐ",
              trang_thai: fp.status || dummy?.trang_thai || "Đang chạy",
              year_sl: 0,
              year_cp: null as number | null,
              year_gd: null as number | null,
              year_roas: null as number | null,
              year_roas3m: null as number | null,
              months: dummy?.months || {
                T1: { roas: null, sl: 0, cp: null, gd: null },
                T2: { roas: null, sl: 0, cp: null, gd: null },
                T3: { roas: null, sl: 0, cp: null, gd: null },
                T4: { roas: null, sl: 0, cp: null, gd: null },
                T5: { roas: null, sl: 0, cp: null, gd: null, roas3m: null },
              },
              cldt: dummy?.cldt,
            };
          })
        : dummyFanpages;

    if (!rawRows || rawRows.length === 0) {
      return basePages;
    }

    // 1. Pre-match every row to all compatible pages to bypass O(N^2) inner looping during filtering
    const rowToMatchedPagesMap = new Map<any, any[]>();
    rawRows.forEach((r) => {
      if (!r.campaign_name) return;
      const matched = basePages.filter((page) => isRowMatchPage(r, page));
      if (matched.length > 0) {
        rowToMatchedPagesMap.set(r, matched);
      }
    });

    // 2. Perform safe, 100% correct matching based on original business logic
    return basePages.map((page) => {
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

        const normCamp = r.campaign_name.toLowerCase().replace(/[\s\-_]/g, "");
        const matchedOthers = matchedOthersAndSelf.filter((other) => {
          if (other.ma_page === page.ma_page && other.name === page.name)
            return false;
          return true;
        });

        if (matchedOthers.length > 0) {
          for (const other of matchedOthers) {
            const otherMaNorm = other.ma_page
              ? other.ma_page.toLowerCase().replace(/[\s\-_]/g, "")
              : "";
            const currMaNorm = page.ma_page
              ? page.ma_page.toLowerCase().replace(/[\s\-_]/g, "")
              : "";

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
              normCamp.includes(
                other.name.toLowerCase().replace(/[\s\-_]/g, ""),
              ) &&
              normCamp.includes(page.name.toLowerCase().replace(/[\s\-_]/g, ""))
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
  }, [rawRows, firestoreFanpages]);

  const filteredData = useMemo(() => {
    return realFanpages
      .map((p) => {
        const v = getVerdict(p, selectedMonth);
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

        return { ...p, verdict: v, metrics };
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
        if (diaLyFilter !== "Tất cả" && p.dia_ly !== diaLyFilter) return false;
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
        )
          return false;
        return true;
      })
      .sort(
        (a, b) =>
          a.verdict.order - b.verdict.order ||
          (b.metrics.cp || 0) - (a.metrics.cp || 0),
      );
  }, [
    realFanpages,
    selectedMonth,
    brandFilter,
    adFilter,
    cgsdFilter,
    typeFilter,
    diaLyFilter,
    verdictFilter,
    searchQuery,
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
      if (diaLyFilter !== "Tất cả" && p.dia_ly !== diaLyFilter) return false;
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
    diaLyFilter,
    searchQuery,
  ]);

  const kpis = useMemo(() => {
    let active = activeCountFromManagement;
    let stop = 0,
      warn = 0,
      star = 0;
    filteredData.forEach((p) => {
      if (p.verdict.v === "stop") stop++;
      if (p.verdict.v === "warn") warn++;
      if (p.verdict.v === "star") star++;
    });
    return { active, stop, warn, star };
  }, [filteredData, activeCountFromManagement]);

  const resetFilters = () => {
    setBrandFilter("Tất cả");
    setAdFilter("Tất cả");
    setCgsdFilter("Tất cả");
    setTypeFilter("Tất cả");
    setDiaLyFilter("Tất cả");
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
    <div className="flex-1 overflow-y-auto bg-[#F4F4F5] p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#15224B] p-5 rounded-2xl text-white shadow-lg">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Fanpage Alert Dashboard
            </h1>
            <p className="text-[#F47D6B] text-sm font-medium mt-1">
              SERYN CLINIC
            </p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-[#F47D6B] hover:bg-[#e06755] text-white font-semibold rounded-lg transition-colors">
            <Bot className="w-4 h-4" /> Tư vấn AI
          </button>
        </div>

        {/* Month Filter - Sticky Candidate */}
        <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm overflow-x-auto flex gap-2 sticky top-0 z-10">
          {monthsList.map((m) => (
            <button
              key={m.id}
              disabled={m.disabled}
              onClick={() => setSelectedMonth(m.id)}
              className={cn(
                "px-5 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap relative",
                m.disabled
                  ? "opacity-40 cursor-not-allowed text-gray-500"
                  : selectedMonth === m.id
                    ? "bg-[#F47D6B] text-white shadow-md"
                    : "text-gray-600 hover:bg-gray-100",
              )}
            >
              {m.label}
              {m.badge && (
                <span
                  className={cn(
                    "absolute -top-1.5 -right-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold",
                    selectedMonth === m.id
                      ? "bg-white text-[#F47D6B]"
                      : "bg-[#F47D6B] text-white",
                  )}
                >
                  {m.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center text-center">
            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">
              Fanpage Active
            </p>
            <p className="text-3xl font-black text-[#15224B]">{kpis.active}</p>
          </div>
          <div className="bg-[#E24B4A]/10 border border-[#E24B4A]/20 p-5 rounded-xl flex flex-col items-center justify-center text-center">
            <p className="text-[#E24B4A] text-xs font-bold uppercase tracking-wider mb-1">
              Dừng Ngay
            </p>
            <p className="text-3xl font-black text-[#E24B4A]">{kpis.stop}</p>
          </div>
          <div className="bg-[#BA7517]/10 border border-[#BA7517]/20 p-5 rounded-xl flex flex-col items-center justify-center text-center">
            <p className="text-[#BA7517] text-xs font-bold uppercase tracking-wider mb-1">
              Cần Xem Xét
            </p>
            <p className="text-3xl font-black text-[#BA7517]">{kpis.warn}</p>
          </div>
          <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 p-5 rounded-xl flex flex-col items-center justify-center text-center">
            <p className="text-[#1D9E75] text-xs font-bold uppercase tracking-wider mb-1">
              Top Performer
            </p>
            <p className="text-3xl font-black text-[#1D9E75]">{kpis.star}</p>
          </div>
        </div>

        {/* Filter Bar 2 */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm grid grid-cols-2 md:grid-cols-7 gap-3">
          <div className="md:col-span-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">
              Brand
            </label>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="w-full mt-1 border-gray-200 rounded-md text-sm font-medium focus:border-[#F47D6B] focus:ring-[#F47D6B]"
            >
              {brands.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">
              Tên AD
            </label>
            <select
              value={adFilter}
              onChange={(e) => setAdFilter(e.target.value)}
              className="w-full mt-1 border-gray-200 rounded-md text-sm font-medium focus:border-[#F47D6B] focus:ring-[#F47D6B]"
            >
              {ads.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">
              CGSĐ
            </label>
            <select
              value={cgsdFilter}
              onChange={(e) => setCgsdFilter(e.target.value)}
              className="w-full mt-1 border-gray-200 rounded-md text-sm font-medium focus:border-[#F47D6B] focus:ring-[#F47D6B]"
            >
              {cgsds.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">
              Loại Page
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full mt-1 border-gray-200 rounded-md text-sm font-medium focus:border-[#F47D6B] focus:ring-[#F47D6B]"
            >
              {types.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">
              Địa lý
            </label>
            <select
              value={diaLyFilter}
              onChange={(e) => setDiaLyFilter(e.target.value)}
              className="w-full mt-1 border-gray-200 rounded-md text-sm font-medium focus:border-[#F47D6B] focus:ring-[#F47D6B]"
            >
              {dialys.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">
              Verdict
            </label>
            <select
              value={verdictFilter}
              onChange={(e) => setVerdictFilter(e.target.value)}
              className="w-full mt-1 border-gray-200 rounded-md text-sm font-medium focus:border-[#F47D6B] focus:ring-[#F47D6B]"
            >
              <option>Tất cả</option>
              <option>Dừng ngay</option>
              <option>Cần xem xét</option>
              <option>Theo dõi</option>
              <option>Giữ lại</option>
              <option>Top performer</option>
              <option>Đã tắt</option>
              <option>Không có data</option>
            </select>
          </div>
          <div className="md:col-span-1 relative">
            <label className="text-[10px] font-bold text-gray-500 uppercase">
              Tìm kiếm
            </label>
            <div className="relative mt-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tên page..."
                className="w-full pl-8 pr-2 py-1.5 border border-gray-200 rounded-md text-sm focus:border-[#F47D6B] focus:ring-[#F47D6B]"
              />
            </div>
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex border-b border-gray-300 gap-6">
          {[
            { id: "canh_bao", label: "Cảnh báo" },
            { id: "bang", label: "Bảng so sánh" },
            { id: "theo_ad", label: "Theo Tên AD" },
            { id: "phan_phoi", label: "Phân phối ROAS" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "pb-3 text-sm font-bold transition-all relative border-b-2",
                activeTab === t.id
                  ? "text-[#15224B] border-[#15224B]"
                  : "text-gray-500 border-transparent hover:text-gray-800",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Empty State */}
        {filteredData.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center bg-white rounded-xl border border-gray-200">
            <FilterX className="w-12 h-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              Không có fanpage nào
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Thử thay đổi bộ lọc hoặc chọn tháng khác
            </p>
            <button
              onClick={resetFilters}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200"
            >
              Xóa tất cả filter
            </button>
          </div>
        ) : (
          <>
            {/* CONTENT TABS */}
            {activeTab === "canh_bao" && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredData.map((page, idx) => {
                  const trend = getTrend(page, selectedMonth);
                  const T = ["T1", "T2", "T3", "T4", "T5"];

                  return (
                    <div
                      key={idx}
                      onClick={() =>
                        setExpandedRow(
                          expandedRow === page.name ? null : page.name,
                        )
                      }
                      className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-all cursor-pointer group flex flex-col"
                    >
                      <div className="p-4 border-b border-gray-100 flex-1">
                        <div className="flex gap-2 mb-2">
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-bold",
                              page.brand === "G"
                                ? "bg-[#378ADD]/10 text-[#378ADD]"
                                : "bg-[#1D9E75]/10 text-[#1D9E75]",
                            )}
                          >
                            {page.brand === "G" ? "MG" : "SC"}
                          </span>
                          {page.ten_ad && (
                            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-bold">
                              {page.ten_ad}
                            </span>
                          )}
                          {page.trang_thai === "Hủy đăng" && (
                            <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 text-[10px] font-bold">
                              Hủy đăng
                            </span>
                          )}
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <h3
                            className="font-semibold text-[#15224B] text-sm leading-tight flex items-center gap-1.5"
                            title={page.ten_page}
                          >
                            {page.ten_page} <CopyButton text={page.ten_page} />
                          </h3>
                        </div>
                        <div
                          className="text-[10px] text-gray-500 mt-1 line-clamp-2"
                          title={page.name}
                        >
                          <span className="font-medium">Mã nguồn Get:</span>{" "}
                          {page.name}
                          <div className="inline-block ml-1">
                            <CopyButton text={page.name} />
                          </div>
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1.5 flex flex-wrap gap-2">
                          {page.ma_page && (
                            <span>
                              Mã:{" "}
                              <strong className="text-gray-700">
                                {page.ma_page}
                              </strong>
                            </span>
                          )}
                          {page.id_page && (
                            <span>
                              ID:{" "}
                              <strong className="text-gray-700">
                                {page.id_page}
                              </strong>
                            </span>
                          )}
                          {page.dia_ly && (
                            <span>
                              Địa lý:{" "}
                              <strong className="text-gray-700">
                                {page.dia_ly}
                              </strong>
                            </span>
                          )}
                        </div>

                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <span
                            className={cn(
                              "px-2 py-1 rounded inline-flex items-center text-xs font-bold",
                              page.verdict.cls,
                            )}
                          >
                            {page.verdict.label}
                          </span>
                          <span
                            className={cn(
                              "px-2.5 py-1 rounded-full inline-flex items-center text-[11px] font-bold border whitespace-nowrap",
                              getStatusBadgeColor(page.trang_thai),
                            )}
                          >
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full mr-1.5 shrink-0",
                                getStatusDotColor(page.trang_thai),
                              )}
                            ></span>
                            {page.trang_thai || "Chưa rõ"}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1 line-clamp-1">
                          {page.verdict.reason}
                        </p>

                        <div className="grid grid-cols-2 gap-y-2 gap-x-4 mt-4 text-sm">
                          <div>
                            <p className="text-[10px] text-gray-400 font-bold uppercase">
                              SĐT (Ads)
                            </p>
                            <p className="font-semibold text-gray-900">
                              {page.metrics.sl > 0 ? page.metrics.sl : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 font-bold uppercase">
                              ROAS (3T)
                            </p>
                            <div className="flex items-center gap-1 font-semibold text-gray-900">
                              <span
                                className={cn(
                                  page.metrics.roas && page.metrics.roas >= 2.5
                                    ? "text-[#1D9E75]"
                                    : page.metrics.roas &&
                                        page.metrics.roas < 1.0
                                      ? "text-[#E24B4A]"
                                      : "text-gray-900",
                                )}
                              >
                                {page.metrics.roas
                                  ? formatRoas(page.metrics.roas)
                                  : "—"}
                              </span>
                              {page.metrics.roas3m && (
                                <span className="text-gray-400 text-xs font-normal">
                                  ({formatRoas(page.metrics.roas3m)})
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="col-span-2">
                            <p className="text-[10px] text-gray-400 font-bold uppercase">
                              CPL
                            </p>
                            <p className="font-medium text-gray-700 text-xs">
                              {formatVND(page.metrics.gd)}
                            </p>
                          </div>
                        </div>

                        {/* Trend sparkline */}
                        <div className="mt-4 pt-3 border-t border-gray-50">
                          <div className="flex items-end justify-between h-8 gap-1">
                            {T.map((m) => {
                              const r = page.months[m]?.roas || 0;
                              const isHighlighted = m === selectedMonth;
                              let h =
                                r > 0 ? Math.min(100, Math.max(10, r * 15)) : 0;
                              let bg =
                                r >= 2.5
                                  ? "bg-[#1D9E75]"
                                  : r >= 1.0
                                    ? "bg-[#639922]"
                                    : r > 0
                                      ? "bg-[#BA7517]"
                                      : "bg-gray-200";
                              if (r > 0 && r < 0.5) bg = "bg-[#E24B4A]";
                              return (
                                <div
                                  key={m}
                                  className={cn(
                                    "w-full rounded-t-sm relative transition-all group/bar",
                                    bg,
                                    isHighlighted
                                      ? "ring-1 ring-offset-1 ring-[#15224B]"
                                      : "opacity-70 hover:opacity-100",
                                  )}
                                  style={{
                                    height: `${h}%`,
                                    minHeight: r > 0 ? "4px" : "2px",
                                  }}
                                >
                                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[9px] py-0.5 px-1 rounded opacity-0 group-hover/bar:opacity-100 pointer-events-none whitespace-nowrap z-10">
                                    {m}: {r > 0 ? formatRoas(r) : "—"}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex justify-between mt-1 text-[8px] text-gray-400 font-bold">
                            {T.map((m) => (
                              <span
                                key={m}
                                className={
                                  m === selectedMonth ? "text-[#15224B]" : ""
                                }
                              >
                                {m}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* CLDT row */}
                        {page.cldt &&
                          page.cldt[
                            selectedMonth === "all" ? "T5" : selectedMonth
                          ] && (
                            <div className="mt-3 flex h-1.5 w-full rounded-full overflow-hidden bg-gray-100">
                              <div
                                className="bg-[#1D9E75]"
                                style={{
                                  width: `${page.cldt[selectedMonth === "all" ? "T5" : selectedMonth].tc_pct * 100}%`,
                                }}
                                title="Tích cực"
                              />
                              <div
                                className="bg-[#E24B4A]"
                                style={{
                                  width: `${page.cldt[selectedMonth === "all" ? "T5" : selectedMonth].neg_pct * 100}%`,
                                }}
                                title="Tiêu cực"
                              />
                            </div>
                          )}
                      </div>

                      {/* Sub row indicator */}
                      <div className="bg-gray-50 px-4 py-2 flex items-center justify-between text-xs text-blue-600 font-semibold group-hover:bg-blue-50 transition-colors">
                        <span>Chi tiết</span>
                        <trend.icon className={cn("w-4 h-4", trend.color)} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === "bang" && (
              <div className="bg-white border text-sm border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                        <th className="px-4 py-3 whitespace-nowrap">
                          Tên Page
                        </th>
                        <th className="px-4 py-3 text-center">Brand</th>
                        <th className="px-4 py-3 text-center">AD</th>
                        <th className="px-4 py-3 text-right">SĐT (Ads)</th>
                        <th className="px-4 py-3 text-right">Chi phí</th>
                        <th className="px-4 py-3 text-right">CPL</th>
                        <th className="px-4 py-3 text-right">ROAS</th>
                        <th className="px-4 py-3 text-right">ROAS 3T</th>
                        <th className="px-4 py-3 text-center">Tình Trạng</th>
                        <th className="px-4 py-3 text-center">Verdict</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredData.map((page, idx) => (
                        <tr
                          key={idx}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() =>
                            setExpandedRow(
                              expandedRow === page.name ? null : page.name,
                            )
                          }
                        >
                          <td className="px-4 py-3 min-w-[280px]">
                            <div className="flex items-start justify-between gap-1">
                              <span className="font-bold text-[#15224B] whitespace-normal leading-tight flex items-start gap-1.5">
                                {page.ten_page}{" "}
                                <div className="mt-[-2px] flex-shrink-0">
                                  <CopyButton text={page.ten_page} />
                                </div>
                              </span>
                            </div>
                            <div
                              className="text-[10px] text-gray-500 mt-1 truncate max-w-[260px] flex items-center gap-1"
                              title={page.name}
                            >
                              <span className="font-medium">Get: </span>{" "}
                              <span className="truncate">{page.name}</span>
                              <CopyButton text={page.name} />
                            </div>
                            <div className="text-[10px] text-gray-400 mt-1 flex flex-wrap gap-2">
                              {page.ma_page && <span>Mã: {page.ma_page}</span>}
                              {page.id_page && <span>ID: {page.id_page}</span>}
                              {page.dia_ly && <span>• {page.dia_ly}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-bold",
                                page.brand === "G"
                                  ? "bg-[#378ADD]/10 text-[#378ADD]"
                                  : "bg-[#1D9E75]/10 text-[#1D9E75]",
                              )}
                            >
                              {page.brand === "G" ? "MG" : "SC"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600">
                            {page.ten_ad || "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">
                            {page.metrics.sl > 0 ? page.metrics.sl : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {formatVND(page.metrics.cp)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {formatVND(page.metrics.gd)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={cn(
                                "font-bold",
                                page.metrics.roas && page.metrics.roas >= 2.5
                                  ? "text-[#1D9E75]"
                                  : page.metrics.roas && page.metrics.roas < 1.0
                                    ? "text-[#E24B4A]"
                                    : "text-gray-900",
                              )}
                            >
                              {page.metrics.roas
                                ? formatRoas(page.metrics.roas)
                                : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-500">
                            {page.metrics.roas3m
                              ? formatRoas(page.metrics.roas3m)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <span
                              className={cn(
                                "px-2.5 py-1 inline-flex items-center rounded-full text-[10px] font-bold border",
                                getStatusBadgeColor(page.trang_thai),
                              )}
                            >
                              <span
                                className={cn(
                                  "w-1.5 h-1.5 rounded-full mr-1.5 shrink-0",
                                  getStatusDotColor(page.trang_thai),
                                )}
                              ></span>
                              {page.trang_thai || "Chưa rõ"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600">
                            <span
                              className={cn(
                                "px-2 py-1 inline-block rounded text-[10px] font-bold w-[90px] text-center",
                                page.verdict.cls,
                              )}
                            >
                              {page.verdict.label}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "theo_ad" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {ads
                  .filter((a) => a !== "Tất cả")
                  .map((adName) => {
                    const adPages = filteredData.filter(
                      (p) => p.ten_ad === adName,
                    );
                    if (adPages.length === 0) return null;

                    const active = adPages.filter(
                      (p) => p.metrics.sl > 0,
                    ).length;
                    const stop = adPages.filter(
                      (p) => p.verdict.v === "stop",
                    ).length;
                    const star = adPages.filter(
                      (p) => p.verdict.v === "star",
                    ).length;
                    const leads = adPages.reduce(
                      (sum, p) => sum + (p.metrics.sl || 0),
                      0,
                    );
                    const spend = adPages.reduce(
                      (sum, p) => sum + (p.metrics.cp || 0),
                      0,
                    );
                    const rawAvgRoas =
                      spend > 0
                        ? adPages.reduce(
                            (sum, p) =>
                              sum + (p.metrics.roas || 0) * p.metrics.cp,
                            0,
                          ) / spend
                        : null;
                    const avgRoas =
                      rawAvgRoas != null ? formatRoas(rawAvgRoas) : "—";

                    return (
                      <div
                        key={adName}
                        className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm"
                      >
                        <div className="flex justify-between items-start mb-6">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-[#15224B] text-white flex items-center justify-center text-xl font-bold">
                              {adName.charAt(0)}
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-gray-900">
                                {adName}
                              </h3>
                              <p className="text-sm text-gray-500 font-medium">
                                {adPages.length} fanpage quản lý ({active}{" "}
                                active)
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500 font-bold uppercase">
                              Avg ROAS
                            </p>
                            <p
                              className={cn(
                                "text-2xl font-black",
                                Number(avgRoas) >= 2.5
                                  ? "text-[#1D9E75]"
                                  : Number(avgRoas) < 1.0
                                    ? "text-[#E24B4A]"
                                    : "text-[#15224B]",
                              )}
                            >
                              {avgRoas}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-2 mb-6">
                          <div className="bg-gray-50 p-2 rounded text-center">
                            <p className="text-[10px] uppercase font-bold text-gray-400">
                              SĐT (Ads)
                            </p>
                            <p className="font-bold text-gray-900 text-sm">
                              {leads}
                            </p>
                          </div>
                          <div className="bg-gray-50 p-2 rounded text-center">
                            <p className="text-[10px] uppercase font-bold text-gray-400">
                              Chi phí
                            </p>
                            <p className="font-bold text-gray-900 text-sm">
                              {formatVND(spend)}
                            </p>
                          </div>
                          <div className="bg-[#E24B4A]/10 p-2 rounded text-center">
                            <p className="text-[10px] uppercase font-bold text-[#E24B4A]">
                              Dừng ngay
                            </p>
                            <p className="font-bold text-[#E24B4A] text-sm">
                              {stop}
                            </p>
                          </div>
                          <div className="bg-[#1D9E75]/10 p-2 rounded text-center">
                            <p className="text-[10px] uppercase font-bold text-[#1D9E75]">
                              Star
                            </p>
                            <p className="font-bold text-[#1D9E75] text-sm">
                              {star}
                            </p>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-xs font-bold text-gray-500 mb-2">
                            Phân bổ hiệu suất
                          </div>
                          <div className="w-full flex h-3 rounded-full overflow-hidden bg-gray-100">
                            {["star", "keep", "watch", "warn", "stop"].map(
                              (v) => {
                                const count = adPages.filter(
                                  (p) => p.verdict.v === v,
                                ).length;
                                if (count === 0) return null;
                                const pct = (count / adPages.length) * 100;
                                const bg =
                                  v === "star"
                                    ? "bg-[#1D9E75]"
                                    : v === "keep"
                                      ? "bg-[#639922]"
                                      : v === "watch"
                                        ? "bg-[#378ADD]"
                                        : v === "warn"
                                          ? "bg-[#BA7517]"
                                          : "bg-[#E24B4A]";
                                return (
                                  <div
                                    key={v}
                                    className={cn(
                                      bg,
                                      "h-full border-r border-white/20 last:border-0",
                                    )}
                                    style={{ width: `${pct}%` }}
                                    title={`${count} page`}
                                  />
                                );
                              },
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {activeTab === "phan_phoi" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-bold text-gray-900 mb-6">
                    Tương quan Chi phí & ROAS
                  </h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart
                        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#E5E7EB"
                        />
                        <XAxis
                          type="number"
                          dataKey="cp"
                          name="Chi phí"
                          tickFormatter={(v) => formatVND(v)}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: "#6B7280" }}
                        />
                        <YAxis
                          type="number"
                          dataKey="roas"
                          name="ROAS"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: "#6B7280" }}
                        />
                        <ZAxis type="number" dataKey="sl" range={[20, 400]} />
                        <RechartsTooltip
                          cursor={{ strokeDasharray: "3 3" }}
                          formatter={(value: any, name: string) => [
                            name === "cp" ? formatVND(value) : value,
                            name === "cp"
                              ? "Chi phí"
                              : name === "roas"
                                ? "ROAS"
                                : name,
                          ]}
                        />
                        <Scatter
                          data={filteredData
                            .filter((p) => p.metrics.roas && p.metrics.cp)
                            .map((p) => ({
                              cp: p.metrics.cp,
                              roas: p.metrics.roas,
                              sl: p.metrics.sl,
                              name: p.name,
                              v: p.verdict.v,
                            }))}
                        >
                          {filteredData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={
                                entry.verdict.v === "star"
                                  ? "#1D9E75"
                                  : entry.verdict.v === "stop"
                                    ? "#E24B4A"
                                    : entry.verdict.v === "warn"
                                      ? "#BA7517"
                                      : entry.verdict.v === "keep"
                                        ? "#639922"
                                        : "#378ADD"
                              }
                              fillOpacity={0.6}
                            />
                          ))}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    Top 10 Page Nổi Bật
                  </h3>
                  <div className="h-[300px] overflow-y-auto pr-2 custom-scrollbar space-y-3 mt-4">
                    {filteredData
                      .filter((p) => p.metrics.roas && p.metrics.roas > 0)
                      .sort(
                        (a, b) => (b.metrics.roas || 0) - (a.metrics.roas || 0),
                      )
                      .slice(0, 10)
                      .map((p, i) => (
                        <div key={i} className="flex items-center gap-4">
                          <span className="text-sm font-bold text-gray-400 w-4">
                            {i + 1}
                          </span>
                          <div className="flex-1">
                            <p
                              className="text-sm font-semibold text-gray-900 truncate"
                              title={p.name}
                            >
                              {p.ten_page}
                            </p>
                            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1 relative overflow-hidden">
                              <div
                                className="absolute top-0 left-0 bottom-0 bg-[#1D9E75] rounded-full"
                                style={{
                                  width: `${Math.min(100, ((p.metrics.roas || 0) / 10) * 100)}%`,
                                }}
                              ></div>
                            </div>
                          </div>
                          <div className="text-right w-16">
                            <p className="text-sm font-bold text-[#1D9E75]">
                              {p.metrics.roas
                                ? formatRoas(p.metrics.roas)
                                : "—"}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* DETAIL PANEL (Inline) */}
            {expandedRow && (
              <div className="fixed inset-x-0 bottom-0 z-50 bg-white border-t border-gray-200 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.1)] p-6 max-h-[60vh] overflow-y-auto w-full max-w-[1400px] mx-auto rounded-t-2xl">
                {(() => {
                  const page = filteredData.find((p) => p.name === expandedRow);
                  if (!page) return null;
                  return (
                    <div className="relative">
                      <button
                        onClick={() => setExpandedRow(null)}
                        className="absolute top-0 right-0 p-2 text-gray-400 hover:text-gray-700 bg-gray-100 rounded-full"
                      >
                        <X className="w-5 h-5" />
                      </button>

                      <div className="pr-12 mb-6">
                        <h2 className="text-xl font-bold text-[#15224B] mb-1 flex items-center gap-2">
                          {page.ten_page} <CopyButton text={page.ten_page} />
                        </h2>
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 bg-gray-50 p-2 rounded-md">
                          <span>
                            <span className="font-medium text-gray-600">
                              Get:
                            </span>{" "}
                            <span className="font-mono">{page.name}</span>
                          </span>
                          <CopyButton text={page.name} />
                        </div>
                        <div className="flex gap-2">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded text-xs font-bold",
                              page.verdict.cls,
                            )}
                          >
                            {page.verdict.label}
                          </span>
                          <button className="flex items-center gap-1.5 px-3 py-0.5 bg-blue-50 text-blue-700 text-xs font-bold rounded hover:bg-blue-100 transition-colors">
                            <Bot className="w-3.5 h-3.5" /> Phân tích AI ↗
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">
                            SĐT (Ads)
                          </p>
                          <p className="text-xl font-bold text-gray-900">
                            {page.metrics.sl}
                          </p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">
                            ROAS
                          </p>
                          <p className="text-xl font-bold text-[#1D9E75]">
                            {page.metrics.roas
                              ? formatRoas(page.metrics.roas)
                              : "—"}
                          </p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">
                            ROAS 3T
                          </p>
                          <p className="text-xl font-bold text-gray-700">
                            {page.metrics.roas3m
                              ? formatRoas(page.metrics.roas3m)
                              : "—"}
                          </p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">
                            Chi phí
                          </p>
                          <p className="text-xl font-bold text-gray-900">
                            {formatVND(page.metrics.cp)}
                          </p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">
                            CPL
                          </p>
                          <p className="text-xl font-bold text-gray-900">
                            {formatVND(page.metrics.gd)}
                          </p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">
                            Lý do
                          </p>
                          <p className="text-xs font-semibold text-[#E24B4A] leading-tight mt-1">
                            {page.verdict.reason}
                          </p>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <h3 className="text-sm font-bold text-gray-700 mb-3">
                            ROAS Trend (T1 - T5)
                          </h3>
                          <div className="h-40">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={["T1", "T2", "T3", "T4", "T5"].map(
                                  (m) => ({
                                    name: m,
                                    ROAS: page.months[m]?.roas || 0,
                                    Leads: page.months[m]?.sl || 0,
                                  }),
                                )}
                              >
                                <CartesianGrid
                                  strokeDasharray="3 3"
                                  vertical={false}
                                  stroke="#E5E7EB"
                                />
                                <XAxis
                                  dataKey="name"
                                  axisLine={false}
                                  tickLine={false}
                                  tick={{ fontSize: 10, fill: "#6B7280" }}
                                />
                                <YAxis
                                  yAxisId="left"
                                  axisLine={false}
                                  tickLine={false}
                                  tick={{ fontSize: 10, fill: "#6B7280" }}
                                />
                                <RechartsTooltip cursor={{ fill: "#F9FAFB" }} />
                                <Bar
                                  yAxisId="left"
                                  dataKey="ROAS"
                                  fill="#378ADD"
                                  radius={[2, 2, 0, 0]}
                                />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        <div>
                          <h3 className="text-sm font-bold text-gray-700 mb-3">
                            Chất lượng data (CLDT)
                          </h3>
                          {page.cldt &&
                          page.cldt[
                            selectedMonth === "all" ? "T5" : selectedMonth
                          ] ? (
                            (() => {
                              const cls =
                                page.cldt[
                                  selectedMonth === "all" ? "T5" : selectedMonth
                                ];
                              const total = cls.total || 1;
                              return (
                                <div className="space-y-4">
                                  <div>
                                    <div className="flex justify-between text-xs font-bold mb-1 text-gray-600">
                                      <span>Tích cực: {cls.tc_sl}</span>
                                      <span>{formatPercent(cls.tc_pct)}</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                      <div
                                        className="bg-[#1D9E75] h-2 rounded-full"
                                        style={{
                                          width: `${cls.tc_pct * 100}%`,
                                        }}
                                      ></div>
                                    </div>
                                  </div>
                                  <div>
                                    <div className="flex justify-between text-xs font-bold mb-1 text-gray-600">
                                      <span>Tiêu cực: {cls.neg_sl}</span>
                                      <span>{formatPercent(cls.neg_pct)}</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                      <div
                                        className="bg-[#E24B4A] h-2 rounded-full"
                                        style={{
                                          width: `${cls.neg_pct * 100}%`,
                                        }}
                                      ></div>
                                    </div>
                                  </div>
                                  <div>
                                    <div className="flex justify-between text-xs font-bold mb-1 text-gray-600">
                                      <span>Care giá: {cls.care_sl}</span>
                                      <span>{formatPercent(cls.care_pct)}</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                      <div
                                        className="bg-[#BA7517] h-2 rounded-full"
                                        style={{
                                          width: `${cls.care_pct * 100}%`,
                                        }}
                                      ></div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()
                          ) : (
                            <p className="text-sm text-gray-500 italic mt-8 text-center">
                              Không có data CLDT cho kỳ này
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Background overlay for Detail Panel */}
            {expandedRow && (
              <div
                className="fixed inset-0 bg-black/10 z-40"
                onClick={() => setExpandedRow(null)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};
