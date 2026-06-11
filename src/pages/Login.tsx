import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { BarChart3 } from 'lucide-react';

export const Login: React.FC = () => {
  const { login } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-100/50 rounded-full blur-3xl"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-100/50 rounded-full blur-3xl"></div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center">
          <div className="w-20 h-20 bg-white rounded-3xl shadow-xl shadow-blue-500/10 flex items-center justify-center border border-gray-100">
            <BarChart3 className="w-10 h-10 text-blue-600" />
          </div>
        </div>
        <h2 className="mt-8 text-center text-4xl font-black text-gray-900 tracking-tight uppercase">
          Auto Meta Ads
        </h2>
        <p className="mt-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
          Hệ thống báo cáo và phân tích dữ liệu Meta Ads
        </p>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="card-premium py-10 px-6 sm:px-12 bg-white/80 backdrop-blur-xl">
          <div className="mb-8 text-center">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-2">Chào mừng trở lại</h3>
            <p className="text-xs font-medium text-gray-500">Vui lòng đăng nhập để tiếp tục truy cập hệ thống</p>
          </div>
          <button
            onClick={login}
            className="w-full flex justify-center items-center gap-3 py-4 px-6 bg-white border border-gray-200 rounded-2xl shadow-sm text-xs font-black text-gray-700 uppercase tracking-widest hover:bg-gray-50 hover:border-blue-200 transition-all active:scale-[0.98] group"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 group-hover:scale-110 transition-transform" />
            Đăng nhập bằng Google
          </button>
          
          <div className="mt-10 pt-8 border-t border-gray-100 text-center">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              &copy; 2026 Auto Meta Ads System
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
