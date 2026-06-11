import React from 'react';
import { Download, Code, CheckCircle2, AlertCircle } from 'lucide-react';

export const Downloads: React.FC = () => {
  return (
    <div className="flex-1 overflow-y-auto bg-[#F4F4F5] p-6 lg:p-8 custom-scrollbar">

      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="mb-10">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Tự động hóa & Tài liệu</h1>
          <p className="text-sm text-gray-500 font-medium mt-1 uppercase tracking-widest">
            Hướng dẫn thiết lập đồng bộ dữ liệu tự động từ Google Sheets về hệ thống.
          </p>
        </div>

        {/* Phương án 1: Auto-sync Client-side */}
        <div className="card-premium p-8 mb-10 relative overflow-hidden group hover:border-blue-200 transition-all duration-300">
          <div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-black px-4 py-1.5 rounded-bl-2xl uppercase tracking-widest shadow-lg shadow-blue-500/20">
            ĐANG HOẠT ĐỘNG
          </div>
          <div className="flex flex-col md:flex-row items-start gap-6">
            <div className="p-4 bg-blue-50 rounded-2xl text-blue-600 group-hover:scale-110 transition-transform duration-300">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 mb-3 uppercase tracking-tight">Phương án 1: Đồng bộ ngầm khi mở App (Khuyên dùng)</h2>
              <p className="text-gray-600 mb-6 text-sm leading-relaxed font-medium">
                Hệ thống đã được lập trình để <strong className="text-blue-600">tự động kiểm tra dữ liệu</strong> mỗi khi bạn hoặc nhân viên mở trang web này. 
                Nếu phát hiện dữ liệu của ngày hôm qua chưa được cập nhật, hệ thống sẽ tự động chạy ngầm quá trình kéo dữ liệu từ Google Sheets về mà không cần bạn phải bấm nút thủ công.
              </p>
              <ul className="text-xs font-bold text-gray-500 space-y-3 uppercase tracking-widest">
                <li className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                  Bảo mật cao nhất (không cần cấp quyền bên ngoài).
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                  Tự động giới hạn tần suất (4 tiếng/lần) để tránh quá tải API.
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                  Không cần cài đặt thêm bất kỳ mã code nào.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Phương án 2: Google Apps Script */}
        <div className="card-premium p-8 bg-white group hover:border-amber-200 transition-all duration-300">
          <div className="flex flex-col md:flex-row items-start gap-6 mb-10">
            <div className="p-4 bg-gray-50 rounded-2xl text-gray-600 group-hover:scale-110 transition-transform duration-300">
              <Code className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 mb-3 uppercase tracking-tight">Phương án 2: Dùng Google Apps Script (Nâng cao)</h2>
              <p className="text-gray-600 text-sm leading-relaxed font-medium">
                Nếu bạn muốn dữ liệu tự động đẩy về lúc nửa đêm (ngay cả khi không có ai mở webapp), bạn có thể cài đặt đoạn mã dưới đây vào file Google Sheets của bạn.
              </p>
              <div className="mt-6 p-5 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest leading-relaxed">
                  <strong className="text-amber-900">Lưu ý bảo mật:</strong> Vì cơ sở dữ liệu của bạn được bảo vệ nghiêm ngặt (chỉ Admin mới được ghi dữ liệu), đoạn mã này yêu cầu bạn phải điền <span className="text-amber-900 underline decoration-2 underline-offset-2">Email và Mật khẩu Admin</span> trực tiếp vào code. Hãy cân nhắc kỹ trước khi sử dụng hoặc chia sẻ file Sheets này cho người khác.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-10">
            <div className="relative pl-8 border-l-2 border-gray-100">
              <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-blue-600"></div>
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-2">Bước 1: Mở trình soạn thảo mã</h3>
              <p className="text-sm text-gray-500 font-medium leading-relaxed">
                Trong file Google Sheets của bạn, chọn menu <strong>Tiện ích mở rộng (Extensions)</strong> &gt; <strong>Apps Script</strong>.
              </p>
            </div>

            <div className="relative pl-8 border-l-2 border-gray-100">
              <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-blue-600"></div>
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-4">Bước 2: Dán đoạn mã sau</h3>
              <div className="bg-gray-900 rounded-2xl p-6 overflow-hidden shadow-2xl shadow-black/20">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                </div>
                <div className="overflow-x-auto custom-scrollbar">
                  <pre className="text-xs text-gray-300 font-mono whitespace-pre leading-relaxed">
{`// Thay thế các thông tin dưới đây bằng thông tin của bạn
const FIREBASE_API_KEY = "AIzaSy... (Lấy trong file firebase-applet-config.json)";
const PROJECT_ID = "ais-dev-... (Lấy trong file firebase-applet-config.json)";
const ADMIN_EMAIL = "email_admin_cua_ban@gmail.com";
const ADMIN_PASSWORD = "mat_khau_cua_ban";

function syncToFirebase() {
  // 1. Đăng nhập để lấy Token
  const authUrl = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + FIREBASE_API_KEY;
  const authPayload = {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    returnSecureToken: true
  };
  
  const authOptions = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(authPayload),
    muteHttpExceptions: true
  };
  
  const authResponse = UrlFetchApp.fetch(authUrl, authOptions);
  const authData = JSON.parse(authResponse.getContentText());
  
  if (!authData.idToken) {
    Logger.log("Lỗi đăng nhập: " + authResponse.getContentText());
    return;
  }
  
  const token = authData.idToken;
  Logger.log("Đăng nhập thành công!");

  // 2. Đẩy dữ liệu lên (Ví dụ cơ bản)
  // Lưu ý: Việc parse toàn bộ dữ liệu CSV và đẩy qua REST API bằng Apps Script 
  // khá phức tạp và dễ gặp lỗi timeout (giới hạn 6 phút của Google).
  // Khuyến nghị sử dụng Phương án 1 (Auto-sync trên Webapp) để ổn định nhất.
  
  Logger.log("Vui lòng sử dụng Phương án 1 để đảm bảo đồng bộ đầy đủ các bảng (Ads, Config, Fanpage).");
}`}
                  </pre>
                </div>
              </div>
            </div>

            <div className="relative pl-8 border-l-2 border-gray-100">
              <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-blue-600"></div>
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-2">Bước 3: Hẹn giờ chạy tự động</h3>
              <p className="text-sm text-gray-500 font-medium leading-relaxed">
                Trong giao diện Apps Script, bấm vào biểu tượng <strong>Đồng hồ (Triggers)</strong> ở menu bên trái. Thêm trigger mới, chọn hàm <code className="bg-gray-100 px-2 py-0.5 rounded-lg font-bold text-blue-600">syncToFirebase</code>, chọn sự kiện theo thời gian (Time-driven), và đặt lịch chạy hàng ngày vào lúc 1h - 2h sáng.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
