export type FanpageMarketConfig = {
  t1_cp_max: number;      // Chi phí tối đa Tầng 1 — chưa đủ data (VND)
  t2_cp_max: number;      // Chi phí tối đa Tầng 2 — cảnh báo vừa (VND)
  roas_cut: number;       // ROAS dưới mức này → nguy hiểm
  roas_scale: number;     // ROAS đạt mức này → Top Performer
  roas_drop_pct: number;  // % giảm so với ROAS 3T → cảnh báo (0.4 = 40%)
  sl_min_stop: number;    // SL tối thiểu để kết luận "Dừng ngay"
};

export type FanpageConfig = {
  noi_dia: FanpageMarketConfig;
  quoc_te: FanpageMarketConfig;
};

export const defaultFanpageConfig: FanpageConfig = {
  noi_dia: {
    t1_cp_max:     50_000_000,
    t2_cp_max:    150_000_000,
    roas_cut:       1.0,
    roas_scale:     2.0,
    roas_drop_pct:  0.4,
    sl_min_stop:   20,
  },
  quoc_te: {
    t1_cp_max:     50_000_000,
    t2_cp_max:    200_000_000,
    roas_cut:       1.5,
    roas_scale:     2.5,
    roas_drop_pct:  0.4,
    sl_min_stop:   30,
  },
};

export type FanpageVerdict = {
  v: string;
  label: string;
  cls: string;
  reason: string;
  order: number;
};

const fmtM = (n: number) =>
  n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' :
  n >= 1e6 ? (n / 1e6).toFixed(0) + 'M' :
  n.toLocaleString('vi-VN');

export function getFanpageVerdict(
  trangThai: string,
  diaLy: string,
  cp: number | null,
  sl: number,
  roas: number | null,
  roas3m: number | null,
  config: FanpageConfig,
): FanpageVerdict {
  // 1. Trạng thái page
  if (trangThai && !trangThai.toLowerCase().includes('đang chạy')) {
    return { v: 'off', label: 'Đã tắt', cls: 'bg-gray-400 text-white', reason: `Trạng thái: ${trangThai}`, order: 7 };
  }

  // 2. Không có chi phí → ẩn mặc định
  const chiPhi = cp ?? 0;
  if (chiPhi === 0 && sl === 0) {
    return { v: 'nodata', label: 'Không có data', cls: 'bg-gray-300 text-gray-600', reason: 'Không phát sinh chi phí kỳ này', order: 6 };
  }

  const cfg = diaLy === 'Quốc tế' ? config.quoc_te : config.noi_dia;
  const r = roas ?? null;

  // Tầng 1 — Chi phí thấp, chưa đủ để kết luận
  if (chiPhi < cfg.t1_cp_max) {
    return { v: 'watch', label: 'Theo dõi', cls: 'bg-[#378ADD] text-white', reason: `Chi phí ${fmtM(chiPhi)} < ${fmtM(cfg.t1_cp_max)}, chưa đủ data`, order: 4 };
  }

  // Tầng 2 — Đủ để nhận xét sơ bộ
  if (chiPhi < cfg.t2_cp_max) {
    if (r !== null && r >= cfg.roas_scale) {
      return { v: 'star', label: 'Top performer', cls: 'bg-[#1D9E75] text-white', reason: `ROAS ${r.toFixed(2)}x ≥ ${cfg.roas_scale}x`, order: 1 };
    }
    if (r !== null && r < cfg.roas_cut && sl >= cfg.sl_min_stop) {
      return { v: 'warn', label: 'Cần xem xét', cls: 'bg-[#BA7517] text-white', reason: `ROAS ${r.toFixed(2)}x < ${cfg.roas_cut}x (Tầng 2)`, order: 3 };
    }
    return { v: 'keep', label: 'Giữ lại', cls: 'bg-[#639922] text-white', reason: `ROAS ${r != null ? r.toFixed(2) + 'x' : '—'}, đang ổn định`, order: 5 };
  }

  // Tầng 3 — Đủ volume, kết luận dứt khoát
  if (r === null || (r === 0 && chiPhi > 10_000_000)) {
    return { v: 'stop', label: 'Dừng ngay', cls: 'bg-[#E24B4A] text-white', reason: `Chi phí ${fmtM(chiPhi)}, ROAS = 0`, order: 2 };
  }
  if (r < cfg.roas_cut && sl >= cfg.sl_min_stop) {
    return { v: 'stop', label: 'Dừng ngay', cls: 'bg-[#E24B4A] text-white', reason: `ROAS ${r.toFixed(2)}x < ${cfg.roas_cut}x với ${sl} SL`, order: 2 };
  }
  if (roas3m != null && roas3m > 0 && r < roas3m * (1 - cfg.roas_drop_pct)) {
    return { v: 'warn', label: 'Cần xem xét', cls: 'bg-[#BA7517] text-white', reason: `ROAS giảm ${Math.round((1 - r / roas3m) * 100)}% so ROAS 3T (${roas3m.toFixed(2)}x)`, order: 3 };
  }
  if (r >= cfg.roas_scale) {
    return { v: 'star', label: 'Top performer', cls: 'bg-[#1D9E75] text-white', reason: `ROAS ${r.toFixed(2)}x ≥ ${cfg.roas_scale}x, scale ngay`, order: 1 };
  }
  if (r >= cfg.roas_cut) {
    return { v: 'keep', label: 'Giữ lại', cls: 'bg-[#639922] text-white', reason: `ROAS ${r.toFixed(2)}x trong ngưỡng an toàn`, order: 5 };
  }
  return { v: 'watch', label: 'Theo dõi', cls: 'bg-[#378ADD] text-white', reason: `ROAS ${r.toFixed(2)}x — SL chưa đủ để kết luận`, order: 4 };
}
