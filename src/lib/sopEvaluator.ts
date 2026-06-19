export const formatInteger = (num: number) => Math.round(num).toLocaleString('vi-VN');

export const getSopStatus = (row: any, vung: 'trong_nuoc' | 'nuoc_ngoai', sopConfig: any) => {
  const cfg = vung === 'nuoc_ngoai' ? sopConfig.nuoc_ngoai : sopConfig.trong_nuoc;
  const messages = row.messages || 0;
  const chiPhi = row.chiPhi || 0;
  const slData = row.slData || 0;
  const tlcd = messages > 0 ? (slData / messages) * 100 : 0;
  const cldt = row.cldt || 0;
  const cpl = slData > 0 ? chiPhi / slData : chiPhi;

  const roasTrongRaw = row.roasTrong || 0;
  const roas3ThangRaw = row.roas3Thang || 0;
  const roasTrongPrevRaw = row.roasTrongPrev || 0;
  const roas3ThangPrevRaw = row.roas3ThangPrev || 0;

  // Backward compatibility: If ROAS was mistakenly saved divided by 100, fix it
  const roasTrong = roasTrongRaw || 0;
  const roas3Thang = roas3ThangRaw || 0;
  const roasTrongPrev = roasTrongPrevRaw || 0;
  const roas3ThangPrev = roas3ThangPrevRaw || 0;

  // Tầng 3: Đánh giá dài hạn (Scale/Cắt)
  if (slData >= cfg.t3_data_min) {
    const currentRoas = vung === 'trong_nuoc' ? roasTrong : roas3Thang;
    const prevRoas = vung === 'trong_nuoc' ? roasTrongPrev : roas3ThangPrev;
    const bestRoas = Math.max(currentRoas, prevRoas); // ratio, e.g. 3.24 = ROAS 3.24x
    const isCldtGood = cldt >= cfg.t3_cldt_min;

    if (bestRoas >= cfg.t3_roas_scale && isCldtGood) {
      return {
        level: 'Tầng 3 - Scale',
        reason: `ROAS Tốt (${bestRoas.toFixed(2)}x), CLDT Đạt (${cldt.toFixed(1)}%)`,
        color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
        urgency: 1
      };
    } else if (bestRoas < cfg.t3_roas_cut && !isCldtGood) {
      return {
        level: 'Tầng 3 - Cắt bỏ',
        reason: `ROAS Kém (${bestRoas.toFixed(2)}x), CLDT Kém (${cldt.toFixed(1)}%)`,
        color: 'text-rose-600 bg-rose-50 border-rose-200',
        urgency: 2
      };
    } else if (bestRoas < cfg.t3_roas_cut && isCldtGood) {
      return {
        level: 'Tầng 3 - Cân nhắc',
        reason: `ROAS Kém (${bestRoas.toFixed(2)}x) nhưng CLDT Đạt (${cldt.toFixed(1)}%)`,
        color: 'text-orange-600 bg-orange-50 border-orange-200',
        urgency: 2
      };
    } else {
      return {
        level: 'Tầng 3 - Giữ',
        reason: `Chỉ số ổn định (ROAS ${bestRoas.toFixed(2)}x)`,
        color: 'text-blue-600 bg-blue-50 border-blue-200',
        urgency: 0
      };
    }
  } else if (slData >= (cfg.t2_data_min || 0)) {
    // Tầng 2: Cảnh báo giá Data & Chất lượng data (cho content ở giữa T1 & T3)
    const cplHT = row.slDataHT > 0 ? row.chiPhiHT / row.slDataHT : (row.chiPhiHT || 0);
    const cplPrev = row.slDataPrev > 0 ? (row.chiPhiPrev || 0) / row.slDataPrev : 0;
    const trendStr = (cplPrev > 0 && cplHT > 0) 
          ? (cplHT > cplPrev ? `CPL Tăng` : `CPL Giảm`)
          : '';

    if (cpl > (cfg.t2_cpl_max || 99999999)) {
      return { 
        level: 'Tầng 2 - Cắt/Giảm',
        reason: `Giá data đắt (${formatInteger(cpl)} > ${formatInteger(cfg.t2_cpl_max)})${trendStr ? ` (${trendStr} so với tháng trước)` : ''}`, 
        color: 'text-amber-600 bg-amber-50 border-amber-200',
        urgency: 2
      };
    }
    if (cldt !== 0 && cldt < (cfg.t2_cldt_min || 0)) {
      return {
        level: 'Tầng 2 - Cắt/Giảm',
        reason: `CLDT kém (${cldt.toFixed(1)}% < ${cfg.t2_cldt_min}%)${trendStr ? ` (${trendStr} so với tháng trước)` : ''}`,
        color: 'text-amber-600 bg-amber-50 border-amber-200',
        urgency: 2
      };
    }
    return {
      level: 'Tầng 2 - Theo dõi',
      reason: `Data ở mức trung gian (${formatInteger(slData)}), CPL & CLDT vẫn trong ngưỡng an toàn`,
      color: 'text-sky-600 bg-sky-50 border-sky-200',
      urgency: 0
    };
  } else {
    // Tầng 1: Cảnh báo sớm
    if (messages >= cfg.t1_mess_min || (slData === 0 && chiPhi >= cfg.t1_cpl_max * 1.5)) {
      if (tlcd < cfg.t1_tlcd_min) {
        return { 
          level: 'Tầng 1 - Cắt sớm', 
          reason: `TLCĐ kém (${tlcd.toFixed(1)}% < ${cfg.t1_tlcd_min}%) sau ${formatInteger(messages)} TN`, 
          color: 'text-rose-600 bg-rose-50 border-rose-200',
          urgency: 3
        };
      }
      if (cpl > cfg.t1_cpl_max) {
        return { 
          level: 'Tầng 1 - Cắt sớm', 
          reason: `Giá data đắt (${formatInteger(cpl)} > ${formatInteger(cfg.t1_cpl_max)})`, 
          color: 'text-rose-600 bg-rose-50 border-rose-200',
          urgency: 3
        };
      }
    }
  }

  return null; // Không vi phạm SOP
};
