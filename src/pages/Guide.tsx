import React, { useState } from 'react';
import { 
  BookOpen, 
  Settings, 
  LineChart, 
  Target, 
  Users, 
  FileText, 
  Download, 
  HelpCircle,
  ChevronRight,
  TrendingUp,
  Zap,
  MousePointer2,
  ShieldCheck,
  ListRestart
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';

interface GuideSection {
  id: string;
  title: string;
  icon: any;
  content: React.ReactNode;
}

export const Guide: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');

  const sections: GuideSection[] = [
    {
      id: 'overview',
      title: 'Tổng quan Hệ thống',
      icon: BookOpen,
      content: (
        <div className="space-y-6">
          <div className="p-6 bg-blue-50 rounded-3xl border border-blue-100">
            <h3 className="text-lg font-black text-blue-900 uppercase tracking-tight mb-2">Chào mừng đến với Auto Meta System</h3>
            <p className="text-xs text-blue-700 font-bold leading-relaxed">
              Hệ thống được thiết kế để tự động hóa việc thu thập, phân tích và tối ưu hóa quảng cáo Meta. Thay vì phải làm báo cáo thủ công qua Google Sheets, bạn có thể theo dõi mọi chỉ số ngay tại đây trong thời gian thực.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                <span className="text-[10px] font-black text-gray-900 uppercase">Minh bạch dữ liệu</span>
              </div>
              <p className="text-[10px] text-gray-500 font-bold leading-relaxed">Dữ liệu được đồng bộ trực tiếp từ nền tảng Meta Ads, loại bỏ sai sót do nhập liệu thủ công.</p>
            </div>
            <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <Zap className="w-5 h-5 text-amber-500" />
                <span className="text-[10px] font-black text-gray-900 uppercase">Tốc độ tối ưu</span>
              </div>
              <p className="text-[10px] text-gray-500 font-bold leading-relaxed">Hệ thống phân tích content và KPI giúp bạn ra quyết định chỉ trong vài giây thay vì vài giờ.</p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'dashboards',
      title: 'Báo cáo & Phân tích',
      icon: LineChart,
      content: (
        <div className="space-y-8">
          <div className="space-y-4">
            <h4 className="text-xs font-black text-gray-900 uppercase flex items-center gap-2">
              <div className="w-1.5 h-4 bg-blue-600 rounded-full" />
              Cách đọc Dashboard Hiệu suất
            </h4>
            <div className="space-y-3">
              <div className="flex items-start gap-4 p-4 hover:bg-gray-50 rounded-2xl transition-colors border border-transparent hover:border-gray-100">
                <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 font-black text-xs">01</div>
                <div>
                  <p className="text-[10px] font-black text-gray-900 uppercase">Chi tiêu & Doanh thu</p>
                  <p className="text-[10px] text-gray-500 font-bold mt-1">Sử dụng biểu đồ 2 cột để so sánh CPA thực tế với Target. Nếu CPA cột xanh cao hơn CPA đỏ, hãy kiểm tra lại target đối tượng.</p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-4 hover:bg-gray-50 rounded-2xl transition-colors border border-transparent hover:border-gray-100">
                <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 font-black text-xs">02</div>
                <div>
                  <p className="text-[10px] font-black text-gray-900 uppercase">Phân tích Phễu (Funnel)</p>
                  <p className="text-[10px] text-gray-500 font-bold mt-1">Theo dõi tỉ lệ CTR (Click Through Rate) của từng Creative. CTR dưới 1% cho thấy Content không còn thu hút.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 bg-gray-900 rounded-[2rem] text-white">
            <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4">Giải nghĩa Chỉ số quan trọng</h4>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[8px] font-black text-gray-400 uppercase">CPA (Cost Per Action)</p>
                <p className="text-xs font-bold mt-1">Chi phí trung bình để có một kết quả mong muốn. Chỉ số quan trọng nhất để đánh giá hiệu quả tiền tiền.</p>
              </div>
              <div>
                <p className="text-[8px] font-black text-gray-400 uppercase">CTR (Click rate)</p>
                <p className="text-xs font-bold mt-1">Đánh giá độ "Viral" của nội dung. CTR cao đồng nghĩa với content tốt hoặc đối tượng chuẩn.</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'content',
      title: 'Tối ưu Content',
      icon: FileText,
      content: (
        <div className="space-y-6">
          <div className="relative p-8 overflow-hidden rounded-3xl bg-indigo-600 text-white">
            <div className="relative z-10">
              <h3 className="text-lg font-black uppercase mb-2">Quy trình 3 Bước Tăng CTR</h3>
              <p className="text-xs text-indigo-100 font-bold opacity-80">Áp dụng cho mọi chiến dịch sáng tạo nội dung.</p>
            </div>
            <FileText className="absolute -right-8 -bottom-8 w-48 h-48 text-indigo-500 opacity-20" />
          </div>

          <div className="space-y-4">
            <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-sm">
              <span className="inline-block px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-[8px] font-black uppercase mb-3">Bước 1: Phân tích Video/Ảnh</span>
              <p className="text-[10px] text-gray-600 font-bold leading-relaxed">Vào phần **Phân tích Content**, lọc theo thời gian 7 ngày. Tìm các mẫu có CPA thấp nhất và CTR cao nhất.</p>
            </div>
            <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-sm">
              <span className="inline-block px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-[8px] font-black uppercase mb-3">Bước 2: Học tập mẫu thắng (Winner)</span>
              <p className="text-[10px] text-gray-600 font-bold leading-relaxed">Nhân bản các yếu tố thành công: Màu sắc, câu hook (3 giây đầu), hoặc định dạng kêu gọi hành động.</p>
            </div>
            <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-sm">
              <span className="inline-block px-2 py-1 bg-rose-50 text-rose-600 rounded text-[8px] font-black uppercase mb-3">Bước 3: Loại bỏ mẫu yếu (Loser)</span>
              <p className="text-[10px] text-gray-600 font-bold leading-relaxed">Tắt ngay các content có CPA vượt ngưỡng 150% Target dù có lượt tương tác cao.</p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'kpi',
      title: 'Theo dõi KPI',
      icon: Target,
      content: (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="text-xs font-black text-gray-900 uppercase">Đối với Admin</h4>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-[10px] font-bold text-gray-500">
                  <div className="w-1 h-1 bg-blue-600 rounded-full" />
                  Sử dụng **Quản lý KPI** để thiết lập Target CPA.
                </li>
                <li className="flex items-center gap-2 text-[10px] font-bold text-gray-500">
                  <div className="w-1 h-1 bg-blue-600 rounded-full" />
                  Theo dõi **Quản lý Truy cập** để biết team có dùng hệ thống không.
                </li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="text-xs font-black text-gray-900 uppercase">Đối với Nhân sự</h4>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-[10px] font-bold text-gray-500">
                  <div className="w-1 h-1 bg-emerald-600 rounded-full" />
                  Xem **Tiến độ KPI** mỗi sáng để biết mình còn thiếu bao nhiêu %.
                </li>
                <li className="flex items-center gap-2 text-[10px] font-bold text-gray-500">
                  <div className="w-1 h-1 bg-emerald-600 rounded-full" />
                  Sử dụng số liệu CPA thực tế để điều chỉnh giá thầu.
                </li>
              </ul>
            </div>
          </div>
          
          <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-100">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="w-6 h-6 text-emerald-600" />
              <h4 className="text-xs font-black text-emerald-900 uppercase">Mẹo Tăng hiệu suất</h4>
            </div>
            <p className="text-[10px] text-emerald-700 font-bold leading-relaxed">
              Bạn nên kiểm tra **Analytics Dashboard** ít nhất 2 lần/ngày: 
              1. Buổi sáng (9:00): Xem lại kết quả ngày hôm trước để tối ưu.
              2. Buổi chiều (16:00): Kiểm tra biến động bất thường để kịp xử lý.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'troubleshoot',
      title: 'Xử lý Sự cố',
      icon: HelpCircle,
      content: (
        <div className="space-y-6">
          <div className="divide-y divide-gray-100">
            <div className="py-4">
              <h5 className="text-[10px] font-black text-gray-900 uppercase mb-2">Dữ liệu không cập nhật?</h5>
              <p className="text-[10px] text-gray-500 font-bold">Hãy liên hệ Admin để thực hiện **Đồng bộ dữ liệu** trong cài đặt. Thông thường hệ thống tự cập nhật mỗi 2-4 tiếng.</p>
            </div>
            <div className="py-4">
              <h5 className="text-[10px] font-black text-gray-900 uppercase mb-2">Không thấy TKQC của mình?</h5>
              <p className="text-[10px] text-gray-500 font-bold">Kiểm tra lại phân quyền Admin Meta hoặc báo Admin hệ thống cập nhật danh sách Partnership trong phần Accounts.</p>
            </div>
            <div className="py-4">
              <h5 className="text-[10px] font-black text-gray-900 uppercase mb-2">Lỗi biễu đồ không load?</h5>
              <p className="text-[10px] text-gray-500 font-bold">Thử Reload trang (F5) hoặc xóa cache trình duyệt. Hệ thống vận hành tốt nhất trên Chrome/Edge.</p>
            </div>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="p-4 md:p-10 max-w-[1400px] mx-auto w-full">
      {/* Header */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-gray-100">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/20">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-gray-900 uppercase tracking-tight">Trung tâm Hướng dẫn</h1>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mt-0.5">Tối ưu thao tác & Tăng hiệu quả vận hành</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-1 space-y-2">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveTab(section.id)}
              className={clsx(
                "w-full flex items-center justify-between p-4 rounded-2xl transition-all duration-300 group",
                activeTab === section.id 
                  ? "bg-indigo-600 text-white shadow-xl shadow-indigo-500/20" 
                  : "bg-white text-gray-400 hover:bg-gray-50 hover:text-gray-900 border border-gray-50"
              )}
            >
              <div className="flex items-center gap-3">
                <section.icon className={clsx("w-4 h-4", activeTab === section.id ? "text-white" : "text-gray-400")} />
                <span className="text-[10px] font-black uppercase tracking-widest">{section.title}</span>
              </div>
              <ChevronRight className={clsx("w-3 h-3", activeTab === section.id ? "opacity-100" : "opacity-0 group-hover:opacity-50")} />
            </button>
          ))}
          
          <div className="mt-10 p-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-3xl border border-indigo-100/50">
             <HelpCircle className="w-8 h-8 text-indigo-600 mb-4" />
             <h4 className="text-[10px] font-black text-indigo-900 uppercase mb-2">Cần hỗ trợ?</h4>
             <p className="text-[9px] text-indigo-700/70 font-bold uppercase leading-relaxed">Nếu gặp lỗi hệ thống, vui lòng chụp màn hình và gửi IT Ticket nội bộ.</p>
          </div>
        </div>

        {/* Content Area */}
        <div className="lg:col-span-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-200/40 p-8 lg:p-12 min-h-[600px]"
            >
              {sections.find(s => s.id === activeTab)?.content}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
