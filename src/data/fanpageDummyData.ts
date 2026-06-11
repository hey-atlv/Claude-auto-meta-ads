export interface FanpageData {
  name: string;
  ten_page: string;
  ma_page: string;
  id_page: string;
  dia_ly: string;
  brand: string;
  ten_ad: string;
  cgsd: string;
  kenh: string;
  phan_loai: string;
  trang_thai: string;
  year_sl: number;
  year_cp: number | null;
  year_gd: number | null;
  year_roas: number | null;
  year_roas3m: number | null;
  months: Record<string, {
    roas: number | null;
    sl: number;
    cp: number | null;
    gd: number | null;
    roas3m?: number | null;
  }>;
  cldt?: Record<string, {
    total: number;
    tc_sl: number; tc_pct: number;
    neg_sl: number; neg_pct: number;
    care_sl: number; care_pct: number;
    mqh_sl: number; mqh_pct: number;
  }>;
}

export const dummyFanpages: FanpageData[] = [
  {
    name: "",
    ten_page: "Phòng khám Seryn Việt Nam",
    ma_page: "Br S01",
    id_page: "100558049051139",
    dia_ly: "Nội địa",
    brand: "S", ten_ad: "Đặng Thị Kim Anh", cgsd: "Khác", kenh: "Thương hiệu", phan_loai: "Thương hiệu", trang_thai: "Đang chạy",
    year_sl: 0, year_cp: null, year_gd: null, year_roas: null, year_roas3m: null,
    months: {
      "T1": { roas: null, sl: 0, cp: null, gd: null },
      "T2": { roas: null, sl: 0, cp: null, gd: null },
      "T3": { roas: null, sl: 0, cp: null, gd: null },
      "T4": { roas: null, sl: 0, cp: null, gd: null },
      "T5": { roas: null, sl: 0, cp: null, gd: null, roas3m: null }
    },
    cldt: {
      "T5": { tc_sl: 80, tc_pct: 0.38, neg_sl: 40, neg_pct: 0.19, care_sl: 60, care_pct: 0.28, mqh_sl: 29, mqh_pct: 0.13, total: 209 }
    }
  },
  {
    name: "",
    ten_page: "Phòng khám đa khoa Seryn",
    ma_page: "Br S02",
    id_page: "103765658707429",
    dia_ly: "Chung",
    brand: "S", ten_ad: "Google", cgsd: "Khác", kenh: "Thương hiệu", phan_loai: "Google", trang_thai: "Đang chạy",
    year_sl: 0, year_cp: null, year_gd: null, year_roas: null, year_roas3m: null,
    months: {
      "T1": { roas: null, sl: 0, cp: null, gd: null },
      "T2": { roas: null, sl: 0, cp: null, gd: null },
      "T3": { roas: null, sl: 0, cp: null, gd: null },
      "T4": { roas: null, sl: 0, cp: null, gd: null },
      "T5": { roas: null, sl: 0, cp: null, gd: null, roas3m: null }
    }
  },
  {
    name: "S - CGSĐ - Ánh - F - ME- F - Lại Minh Hiếu - Chuyên gia sắc đẹp Seryn",
    ten_page: "Lại Minh Hiếu - Chuyên gia sắc đẹp Seryn",
    ma_page: "Ánh S01",
    id_page: "100520919038615",
    dia_ly: "Quốc tế",
    brand: "S", ten_ad: "Nguyễn Tiến Ánh", cgsd: "Lại Minh Hiếu", kenh: "Thương hiệu", phan_loai: "CGSĐ", trang_thai: "Đang chạy",
    year_sl: 0, year_cp: null, year_gd: null, year_roas: null, year_roas3m: null,
    months: {
      "T1": { roas: null, sl: 0, cp: null, gd: null },
      "T2": { roas: null, sl: 0, cp: null, gd: null },
      "T3": { roas: null, sl: 0, cp: null, gd: null },
      "T4": { roas: null, sl: 0, cp: null, gd: null },
      "T5": { roas: null, sl: 0, cp: null, gd: null, roas3m: null }
    },
    cldt: {
      "T5": { tc_sl: 80, tc_pct: 0.38, neg_sl: 40, neg_pct: 0.19, care_sl: 60, care_pct: 0.28, mqh_sl: 29, mqh_pct: 0.13, total: 209 }
    }
  },
  {
    name: "S - CGSĐ - Ánh - F - ME- F - Lại Minh Hiếu - Chuyên gia sắc đẹp Seryn Việt Nam",
    ten_page: "Lại Minh Hiếu - Chuyên gia sắc đẹp Seryn Việt Nam",
    ma_page: "Ánh S02",
    id_page: "102248398862424",
    dia_ly: "Nội địa",
    brand: "S", ten_ad: "Nguyễn Tiến Ánh", cgsd: "Lại Minh Hiếu", kenh: "Thương hiệu", phan_loai: "CGSĐ", trang_thai: "Đang chạy",
    year_sl: 0, year_cp: null, year_gd: null, year_roas: null, year_roas3m: null,
    months: {
      "T1": { roas: null, sl: 0, cp: null, gd: null },
      "T2": { roas: null, sl: 0, cp: null, gd: null },
      "T3": { roas: null, sl: 0, cp: null, gd: null },
      "T4": { roas: null, sl: 0, cp: null, gd: null },
      "T5": { roas: null, sl: 0, cp: null, gd: null, roas3m: null }
    }
  },
  {
    name: "S - CGSĐ - Hiếu - F - ME- F - Lại Minh Hiếu - Seryn Clinic",
    ten_page: "Lại Minh Hiếu - Seryn Clinic",
    ma_page: "Hiếu S01",
    id_page: "106520701759798",
    dia_ly: "Quốc tế",
    brand: "S", ten_ad: "Vũ Minh Hiếu", cgsd: "Lại Minh Hiếu", kenh: "Thương hiệu", phan_loai: "CGSĐ", trang_thai: "Đang chạy",
    year_sl: 0, year_cp: null, year_gd: null, year_roas: null, year_roas3m: null,
    months: {
      "T1": { roas: null, sl: 0, cp: null, gd: null },
      "T2": { roas: null, sl: 0, cp: null, gd: null },
      "T3": { roas: null, sl: 0, cp: null, gd: null },
      "T4": { roas: null, sl: 0, cp: null, gd: null },
      "T5": { roas: null, sl: 0, cp: null, gd: null, roas3m: null }
    }
  },
  {
    name: "S - CGSĐ - Hiếu - F - ME- F - Lại Minh Hiếu - Seryn Clinic Việt Nam",
    ten_page: "Lại Minh Hiếu - Seryn Clinic Việt Nam",
    ma_page: "Hiếu S02",
    id_page: "108910554850173",
    dia_ly: "Nội địa",
    brand: "S", ten_ad: "Vũ Minh Hiếu", cgsd: "Lại Minh Hiếu", kenh: "Thương hiệu", phan_loai: "CGSĐ", trang_thai: "Đang chạy",
    year_sl: 0, year_cp: null, year_gd: null, year_roas: null, year_roas3m: null,
    months: {
      "T1": { roas: null, sl: 0, cp: null, gd: null },
      "T2": { roas: null, sl: 0, cp: null, gd: null },
      "T3": { roas: null, sl: 0, cp: null, gd: null },
      "T4": { roas: null, sl: 0, cp: null, gd: null },
      "T5": { roas: null, sl: 0, cp: null, gd: null, roas3m: null }
    }
  },
  {
    name: "S - CGSĐ - Kim Anh - F - ME- F - Lại Minh Hiếu - Phòng khám Seryn",
    ten_page: "Lại Minh Hiếu - Phòng khám Seryn",
    ma_page: "KA S01",
    id_page: "191037889667981",
    dia_ly: "Nội địa",
    brand: "S", ten_ad: "Đặng Thị Kim Anh", cgsd: "Lại Minh Hiếu", kenh: "Thương hiệu", phan_loai: "CGSĐ", trang_thai: "Đang chạy",
    year_sl: 0, year_cp: null, year_gd: null, year_roas: null, year_roas3m: null,
    months: {
      "T1": { roas: null, sl: 0, cp: null, gd: null },
      "T2": { roas: null, sl: 0, cp: null, gd: null },
      "T3": { roas: null, sl: 0, cp: null, gd: null },
      "T4": { roas: null, sl: 0, cp: null, gd: null },
      "T5": { roas: null, sl: 0, cp: null, gd: null, roas3m: null }
    }
  },
  {
    name: "S - CGSĐ - Liên - F - ME- F - Lại Minh Hiếu - Phòng khám công nghệ cao Seryn",
    ten_page: "Lại Minh Hiếu - Phòng khám công nghệ cao Seryn",
    ma_page: "Liên S01",
    id_page: "106082048471185",
    dia_ly: "Quốc tế",
    brand: "S", ten_ad: "Nguyễn Thị Liên", cgsd: "Lại Minh Hiếu", kenh: "Thương hiệu", phan_loai: "CGSĐ", trang_thai: "Đang chạy",
    year_sl: 0, year_cp: null, year_gd: null, year_roas: null, year_roas3m: null,
    months: {
      "T1": { roas: null, sl: 0, cp: null, gd: null },
      "T2": { roas: null, sl: 0, cp: null, gd: null },
      "T3": { roas: null, sl: 0, cp: null, gd: null },
      "T4": { roas: null, sl: 0, cp: null, gd: null },
      "T5": { roas: null, sl: 0, cp: null, gd: null, roas3m: null }
    }
  },
  {
    name: "S - CGSĐ - Liên - F - ME- F - Thanh Xuân - Seryn Clinic Việt Nam",
    ten_page: "Thanh Xuân - Seryn Clinic Việt Nam",
    ma_page: "Liên S04",
    id_page: "110789431347813",
    dia_ly: "Nội địa",
    brand: "S", ten_ad: "Nguyễn Thị Liên", cgsd: "Thanh Xuân", kenh: "Thương hiệu", phan_loai: "CGSĐ", trang_thai: "Đang chạy",
    year_sl: 0, year_cp: null, year_gd: null, year_roas: null, year_roas3m: null,
    months: {
      "T1": { roas: null, sl: 0, cp: null, gd: null },
      "T2": { roas: null, sl: 0, cp: null, gd: null },
      "T3": { roas: null, sl: 0, cp: null, gd: null },
      "T4": { roas: null, sl: 0, cp: null, gd: null },
      "T5": { roas: null, sl: 0, cp: null, gd: null, roas3m: null }
    }
  },
  {
    name: "",
    ten_page: "Phòng khám trẻ hoá công nghệ cao Seryn - Chi nhánh Xã Đàn",
    ma_page: "Liên S05",
    id_page: "441794435673971",
    dia_ly: "Miền Bắc",
    brand: "S", ten_ad: "Nguyễn Thị Liên", cgsd: "Khác", kenh: "Thương hiệu", phan_loai: "Thương hiệu", trang_thai: "Đang chạy",
    year_sl: 0, year_cp: null, year_gd: null, year_roas: null, year_roas3m: null,
    months: {
      "T1": { roas: null, sl: 0, cp: null, gd: null },
      "T2": { roas: null, sl: 0, cp: null, gd: null },
      "T3": { roas: null, sl: 0, cp: null, gd: null },
      "T4": { roas: null, sl: 0, cp: null, gd: null },
      "T5": { roas: null, sl: 0, cp: null, gd: null, roas3m: null }
    }
  },
  {
    name: "S - CGSĐ - Khiêm- F - ME- F - Chuyên gia sắc đẹp Lại Minh Hiếu - Seryn Việt Nam",
    ten_page: "Chuyên gia sắc đẹp Lại Minh Hiếu - Seryn Việt Nam",
    ma_page: "Khiêm S06",
    id_page: "113659300977172",
    dia_ly: "Quốc tế",
    brand: "S", ten_ad: "Quản Cao Khiêm", cgsd: "Lại Minh Hiếu", kenh: "Thương hiệu", phan_loai: "CGSĐ", trang_thai: "Đang chạy",
    year_sl: 0, year_cp: null, year_gd: null, year_roas: null, year_roas3m: null,
    months: {
      "T1": { roas: null, sl: 0, cp: null, gd: null },
      "T2": { roas: null, sl: 0, cp: null, gd: null },
      "T3": { roas: null, sl: 0, cp: null, gd: null },
      "T4": { roas: null, sl: 0, cp: null, gd: null },
      "T5": { roas: null, sl: 0, cp: null, gd: null, roas3m: null }
    }
  },
  {
    name: "S - CGSĐ - Liên - F - ME- F - Chuyên gia sắc đẹp Lại Minh Hiếu - Seryn Clinic",
    ten_page: "Chuyên gia sắc đẹp Lại Minh Hiếu - Seryn Clinic",
    ma_page: "Liên S07",
    id_page: "110304951354635",
    dia_ly: "Nội địa",
    brand: "S", ten_ad: "Nguyễn Thị Liên", cgsd: "Lại Minh Hiếu", kenh: "Thương hiệu", phan_loai: "CGSĐ", trang_thai: "Đang chạy",
    year_sl: 0, year_cp: null, year_gd: null, year_roas: null, year_roas3m: null,
    months: {
      "T1": { roas: null, sl: 0, cp: null, gd: null },
      "T2": { roas: null, sl: 0, cp: null, gd: null },
      "T3": { roas: null, sl: 0, cp: null, gd: null },
      "T4": { roas: null, sl: 0, cp: null, gd: null },
      "T5": { roas: null, sl: 0, cp: null, gd: null, roas3m: null }
    }
  },
  {
    name: "S - CGSĐ - Khiêm- F - ME- F - Chuyên gia sắc đẹp Lại Minh Hiếu - Phòng khám Seryn",
    ten_page: "Chuyên gia sắc đẹp Lại Minh Hiếu - Phòng khám Seryn Việt Nam",
    ma_page: "Khiêm S07",
    id_page: "153557273492933",
    dia_ly: "Nội địa",
    brand: "S", ten_ad: "Quản Cao Khiêm", cgsd: "Lại Minh Hiếu", kenh: "Thương hiệu", phan_loai: "CGSĐ", trang_thai: "Đang chạy",
    year_sl: 0, year_cp: null, year_gd: null, year_roas: null, year_roas3m: null,
    months: {
      "T1": { roas: null, sl: 0, cp: null, gd: null },
      "T2": { roas: null, sl: 0, cp: null, gd: null },
      "T3": { roas: null, sl: 0, cp: null, gd: null },
      "T4": { roas: null, sl: 0, cp: null, gd: null },
      "T5": { roas: null, sl: 0, cp: null, gd: null, roas3m: null }
    }
  },
  {
    name: "S - CGSĐ - Kim Anh - F - ME- F - Mr. Lại Minh Hiếu -Seryn Clinic",
    ten_page: "Mr. Lại Minh Hiếu -Seryn Clinic",
    ma_page: "KA S16",
    id_page: "146787417517359",
    dia_ly: "Quốc tế",
    brand: "S", ten_ad: "Đặng Thị Kim Anh", cgsd: "Lại Minh Hiếu", kenh: "Thương hiệu", phan_loai: "CGSĐ", trang_thai: "Đang chạy",
    year_sl: 0, year_cp: null, year_gd: null, year_roas: null, year_roas3m: null,
    months: {
      "T1": { roas: null, sl: 0, cp: null, gd: null },
      "T2": { roas: null, sl: 0, cp: null, gd: null },
      "T3": { roas: null, sl: 0, cp: null, gd: null },
      "T4": { roas: null, sl: 0, cp: null, gd: null },
      "T5": { roas: null, sl: 0, cp: null, gd: null, roas3m: null }
    }
  },
  {
    name: "S - KIM ANH - F - RE - F - Phòng khám đa khoa Seryn Việt Nam",
    ten_page: "Phòng khám đa khoa Seryn Việt Nam",
    ma_page: "BR 06",
    id_page: "101136148947610",
    dia_ly: "Nội địa",
    brand: "S", ten_ad: "Đặng Thị Kim Anh", cgsd: "Khác", kenh: "Thương hiệu", phan_loai: "Thương hiệu", trang_thai: "Đang chạy",
    year_sl: 0, year_cp: null, year_gd: null, year_roas: null, year_roas3m: null,
    months: {
      "T1": { roas: null, sl: 0, cp: null, gd: null },
      "T2": { roas: null, sl: 0, cp: null, gd: null },
      "T3": { roas: null, sl: 0, cp: null, gd: null },
      "T4": { roas: null, sl: 0, cp: null, gd: null },
      "T5": { roas: null, sl: 0, cp: null, gd: null, roas3m: null }
    }
  }
];
