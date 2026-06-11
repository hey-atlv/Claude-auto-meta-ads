import React, { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp, Search, MessageCircle, AlertCircle, FileQuestion } from 'lucide-react';
import clsx from 'clsx';

interface FAQItem {
  question: string;
  answer: string;
  category: 'technical' | 'analytics' | 'account';
}

export const FAQ: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs: FAQItem[] = [
    {
      category: 'technical',
      question: 'Tại sao dữ liệu trên hệ thống khác với Meta Ads Manager?',
      answer: 'Hệ thống cập nhật dữ liệu định kỳ (mỗi 2-4 tiếng). Meta Ads Manager cũng có độ trễ cập nhật (lên đến 24h đối với một số chỉ số chuyển đổi). Do đó, sự sai lệch nhỏ là bình thường. Tuy nhiên, nếu sai lệch trên 20%, vui lòng báo Admin kiểm tra kết nối API.'
    },
    {
      category: 'analytics',
      question: 'Làm thế nào để xuất báo cáo ra file Excel?',
      answer: 'Bạn vào trang "Dashboard Hiệu suất" hoặc "Analytics Dashboard", tìm nút "Xuất dữ liệu" (thường nằm ở góc trên bên phải biểu đồ). Hệ thống sẽ xuất file CSV chứa dữ liệu thô để bạn xử lý thêm.'
    },
    {
      category: 'account',
      question: 'Tôi được cấp quyền Admin Meta nhưng không thấy TKQC trên web?',
      answer: 'Hệ thống cần được Admin "Đồng bộ Partnership" thủ công trong trang Cài đặt để nhận diện các tài khoản mới được cấp quyền. Vui lòng nhắn tin cho Team Leader để thực hiện thao tác này.'
    },
    {
      category: 'technical',
      question: 'Lỗi "Missing Permissions" khi xem biểu đồ?',
      answer: 'Lỗi này xảy ra khi Token kết nối với Meta bị hết hạn hoặc bị thu hồi. Admin cần thực hiện "Re-authorize" trong phần Cài đặt Hệ thống.'
    },
    {
      category: 'analytics',
      question: 'Chỉ số CPA được tính như thế nào?',
      answer: 'CPA = Tổng Chi tiêu / Tổng Kết quả (số tin nhắn, số chuyển đổi, v.v.). Hệ thống lấy dữ liệu trực tiếp từ cột "Result" mà bạn đã cấu hình trong Meta Ads Manager cho chiến dịch đó.'
    }
  ];

  const filteredFaqs = faqs.filter(f => 
    f.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.answer.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-10 max-w-[1000px] mx-auto w-full">
      <div className="text-center mb-16 space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-[2rem] shadow-2xl shadow-blue-500/30 mb-4 animate-bounce">
          <HelpCircle className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">Câu hỏi Thường gặp</h1>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Giải đáp thắc mắc & Xử lý sự cố nhanh</p>
      </div>

      <div className="relative mb-12">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input 
          type="text"
          placeholder="Tìm kiếm vấn đề bạn đang gặp phải..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-16 pr-8 py-5 bg-white border border-gray-100 rounded-3xl shadow-xl shadow-gray-200/40 focus:ring-4 focus:ring-blue-50 focus:border-blue-600 outline-none transition-all font-bold text-sm text-gray-900 placeholder:text-gray-300 placeholder:font-black placeholder:uppercase placeholder:tracking-widest"
        />
      </div>

      <div className="space-y-4">
        {filteredFaqs.length > 0 ? (
          filteredFaqs.map((faq, index) => (
            <div 
              key={index} 
              className={clsx(
                "bg-white rounded-3xl border transition-all duration-500 overflow-hidden",
                openIndex === index ? "border-blue-600 shadow-xl shadow-blue-500/10" : "border-gray-50 shadow-sm hover:border-blue-100"
              )}
            >
              <button 
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-8 py-6 flex items-center justify-between text-left group"
              >
                <div className="flex items-center gap-4">
                  <div className={clsx(
                    "w-2 h-2 rounded-full",
                    faq.category === 'technical' ? 'bg-rose-500' : faq.category === 'analytics' ? 'bg-blue-500' : 'bg-emerald-500'
                  )} />
                  <span className="text-sm font-black text-gray-900 uppercase tracking-tight group-hover:text-blue-600 transition-colors">
                    {faq.question}
                  </span>
                </div>
                {openIndex === index ? (
                  <ChevronUp className="w-5 h-5 text-blue-600" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-300 group-hover:text-blue-600" />
                )}
              </button>
              
              {openIndex === index && (
                <div className="px-8 pb-8 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="h-px bg-gray-50 mb-6" />
                  <p className="text-sm text-gray-500 font-bold leading-relaxed">
                    {faq.answer}
                  </p>
                  <div className="mt-6 flex items-center gap-3">
                    <span className="text-[8px] font-black uppercase text-gray-300 tracking-widest">Phân loại:</span>
                    <span className="px-2 py-1 bg-gray-50 rounded text-[8px] font-black uppercase text-gray-500">
                      {faq.category}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="p-20 text-center flex flex-col items-center gap-4">
             <AlertCircle className="w-12 h-12 text-gray-200" />
             <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Không tìm thấy kết quả phù hợp</p>
          </div>
        )}
      </div>

      <div className="mt-20 p-10 bg-gray-900 rounded-[3rem] relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-10 opacity-10 transition-transform duration-700 group-hover:rotate-12">
          <MessageCircle className="w-32 h-32 text-blue-400" />
        </div>
        <div className="relative">
          <h3 className="text-xl font-black text-white uppercase tracking-tight mb-4">Vẫn cần giúp đỡ?</h3>
          <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-8 leading-relaxed max-w-md">
            Nếu bạn không tìm thấy câu trả lời trong trang FAQ hoặc Hướng dẫn sử dụng, đừng ngần ngại liên hệ với team Technical Support.
          </p>
          <button className="px-8 py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-blue-500/20 hover:bg-blue-500 transition-all active:scale-95">
            Gửi yêu cầu hỗ trợ ngay
          </button>
        </div>
      </div>
    </div>
  );
};
