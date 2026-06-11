import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSheetsData } from '../contexts/SheetsDataContext';
import { useActivityLogger } from '../hooks/useActivityLogger';
import { 
  LayoutDashboard, 
  Megaphone, 
  BarChart3, 
  TrendingUp,
  FileText, 
  Settings, 
  History, 
  BookOpen, 
  Download, 
  HelpCircle,
  LogOut,
  Users,
  Flag,
  RefreshCw,
  Target,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  Menu,
  X,
  Activity,
  CreditCard,
  Gauge,
  Clapperboard,
  BellRing,
  ShieldAlert,
  Radar
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'motion/react';

const SidebarLink = ({ to, icon: Icon, iconColor = "text-gray-400", children, onClick, isCollapsed }: { to: string, icon: any, iconColor?: string, children: React.ReactNode, onClick?: () => void, isCollapsed?: boolean }) => (
  <NavLink to={to} onClick={onClick}>
    {({ isActive }) => (
      <div className={clsx(
        "flex items-center rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300 group relative",
        isCollapsed ? "justify-center p-3" : "justify-between px-4 py-3",
        isActive 
          ? "bg-blue-600 text-white shadow-xl shadow-blue-500/20 ring-4 ring-blue-50" 
          : "text-gray-400 hover:bg-gray-50 hover:text-gray-900"
      )}>
        <div className={clsx("flex items-center", isCollapsed ? "justify-center" : "gap-3")}>
          <Icon className={clsx("w-5 h-5 transition-transform duration-300 group-hover:scale-110", isActive ? "text-white" : iconColor)} />
          {!isCollapsed && <span>{children}</span>}
        </div>
        {!isCollapsed && (
          <ChevronRight className={clsx("w-3 h-3 transition-all duration-300", isActive ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0")} />
        )}
        
        {isCollapsed && (
          <div className="absolute left-full ml-4 px-3 py-2 bg-gray-900 text-white text-[10px] rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-[100] shadow-xl">
            {children}
          </div>
        )}
      </div>
    )}
  </NavLink>
);

const SidebarGroup = ({ title, children, isCollapsed }: { title: string, children: React.ReactNode, isCollapsed?: boolean }) => (
  <div className="mb-10">
    {!isCollapsed && (
      <h3 className="px-4 mb-4 text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">
        {title}
      </h3>
    )}
    <div className="space-y-2">
      {children}
    </div>
  </div>
);

export const Layout: React.FC = () => {
  const { user, role, logout } = useAuth();
  const { isAutoSyncing, error } = useSheetsData();
  const { logActivity } = useActivityLogger();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const location = useLocation();

  // Close mobile menu when route changes and log activity
  React.useEffect(() => {
    setIsMobileMenuOpen(false);
    if (user) {
      logActivity('VIEW_PAGE', location.pathname);
    }
  }, [location.pathname, user]);

  return (
    <div className="flex h-screen bg-gray-50/50 overflow-hidden">
      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={clsx(
        "fixed inset-y-0 left-0 z-50 bg-white border-r border-gray-100 flex flex-col shadow-2xl shadow-gray-200/50 transition-all duration-300 ease-in-out lg:relative lg:translate-x-0 overflow-visible",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        isSidebarCollapsed ? "w-20" : "w-80"
      )}>
        <div className={clsx("p-6 flex items-center justify-between overflow-visible transition-all", isSidebarCollapsed ? "p-4" : "lg:p-8 mb-2")}>
          {!isSidebarCollapsed ? (
            <motion.h1 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xl lg:text-2xl font-black text-gray-900 flex items-center gap-3 tracking-tighter uppercase whitespace-nowrap"
            >
              <div className="w-10 h-10 lg:w-12 lg:h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/30">
                <BarChart3 className="w-6 h-6 lg:w-7 lg:h-7 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="leading-none">Auto Meta</span>
                <span className="text-[9px] lg:text-[10px] text-blue-600 tracking-[0.3em] mt-1">Ads System</span>
              </div>
            </motion.h1>
          ) : (
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30 mx-auto">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
          )}
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden p-2 text-gray-400 hover:text-gray-900 bg-gray-50 rounded-xl"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Collapse Toggle */}
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="hidden lg:flex absolute -right-3.5 top-24 w-7 h-7 bg-white border border-gray-100 rounded-full items-center justify-center shadow-xl text-gray-400 hover:text-white hover:bg-blue-600 hover:border-blue-500 transition-all z-[100] group active:scale-90"
          title={isSidebarCollapsed ? "Mở rộng menu" : "Thu gọn menu"}
        >
          {isSidebarCollapsed ? (
            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          ) : (
            <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
          )}
        </button>
        
        <div className={clsx("flex-1 overflow-y-auto px-4 lg:px-6 py-2 custom-scrollbar", isSidebarCollapsed && "px-2")}>
          <SidebarGroup title="Tổng Quan" isCollapsed={isSidebarCollapsed}>
            <SidebarLink to="/accounts" icon={CreditCard} iconColor="text-emerald-500" isCollapsed={isSidebarCollapsed}>Quản lý TKQC</SidebarLink>
            <SidebarLink to="/pages" icon={Flag} iconColor="text-indigo-500" isCollapsed={isSidebarCollapsed}>Quản lý Fanpage</SidebarLink>
            {user && role === 'admin' && (
              <SidebarLink to="/kpi-management" icon={Target} iconColor="text-rose-500" isCollapsed={isSidebarCollapsed}>Quản lý KPI</SidebarLink>
            )}
          </SidebarGroup>

          <SidebarGroup title="Phân Tích" isCollapsed={isSidebarCollapsed}>
            <SidebarLink to="/dashboard" icon={LayoutDashboard} iconColor="text-blue-500" isCollapsed={isSidebarCollapsed}>Dashboard Hiệu suất</SidebarLink>
            <SidebarLink to="/analytics" icon={BarChart3} iconColor="text-violet-500" isCollapsed={isSidebarCollapsed}>Analytics Dashboard</SidebarLink>
            <SidebarLink to="/roas-summary" icon={TrendingUp} iconColor="text-cyan-500" isCollapsed={isSidebarCollapsed}>ROAS Tổng hợp</SidebarLink>
            <SidebarLink to="/kpi-progress" icon={Gauge} iconColor="text-amber-500" isCollapsed={isSidebarCollapsed}>Tiến độ KPI</SidebarLink>
            <SidebarLink to="/alerts" icon={BellRing} iconColor="text-rose-500" isCollapsed={isSidebarCollapsed}>Cảnh báo Content</SidebarLink>
            <SidebarLink to="/alerts-fanpage" icon={ShieldAlert} iconColor="text-orange-500" isCollapsed={isSidebarCollapsed}>Cảnh báo Fanpage</SidebarLink>
            <SidebarLink to="/content" icon={Clapperboard} iconColor="text-fuchsia-500" isCollapsed={isSidebarCollapsed}>Phân tích Content</SidebarLink>
          </SidebarGroup>

          <SidebarGroup title="Vận Hành" isCollapsed={isSidebarCollapsed}>
            <SidebarLink to="/settings" icon={Settings} iconColor="text-slate-500" isCollapsed={isSidebarCollapsed}>Cài đặt</SidebarLink>
            {user && role === 'admin' && (
              <SidebarLink to="/usage" icon={Radar} iconColor="text-teal-500" isCollapsed={isSidebarCollapsed}>Quản lý Truy cập</SidebarLink>
            )}
            <SidebarLink to="/changelog" icon={History} iconColor="text-gray-500" isCollapsed={isSidebarCollapsed}>Nhật ký Thay đổi</SidebarLink>
          </SidebarGroup>

          <SidebarGroup title="Tài Nguyên" isCollapsed={isSidebarCollapsed}>
            <SidebarLink to="/guide" icon={BookOpen} iconColor="text-blue-500" isCollapsed={isSidebarCollapsed}>Tổng quan & Các bước</SidebarLink>
            <SidebarLink to="/downloads" icon={Download} iconColor="text-emerald-500" isCollapsed={isSidebarCollapsed}>Download Script</SidebarLink>
            <SidebarLink to="/faq" icon={HelpCircle} iconColor="text-amber-500" isCollapsed={isSidebarCollapsed}>FAQ & Xử lý Lỗi</SidebarLink>
          </SidebarGroup>
        </div>

        <div className={clsx("p-6 lg:p-8 border-t border-gray-50 bg-gray-50/30", isSidebarCollapsed && "p-2 py-4")}>
          {!isSidebarCollapsed ? (
            <div className="flex items-center gap-3 lg:gap-4 mb-6 lg:mb-8 p-3 rounded-3xl bg-white border border-gray-100 shadow-xl shadow-gray-200/50 group hover:border-blue-200 transition-all duration-300">
              <div className="relative">
                <img 
                  src={user?.photoURL || `https://ui-avatars.com/api/?name=${user?.email}`} 
                  alt="Avatar" 
                  className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl object-cover shadow-lg"
                />
                <div className="absolute -bottom-1 -right-1 w-3 h-3 lg:w-4 lg:h-4 bg-emerald-500 border-2 border-white rounded-full"></div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] lg:text-xs font-black text-gray-900 truncate uppercase tracking-widest">{user?.displayName || 'User'}</p>
                <p className="text-[9px] lg:text-[10px] font-bold text-gray-400 truncate uppercase tracking-tighter mt-0.5">{user?.email}</p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center mb-6">
               <img 
                src={user?.photoURL || `https://ui-avatars.com/api/?name=${user?.email}`} 
                alt="Avatar" 
                className="w-10 h-10 rounded-xl object-cover shadow-md"
              />
            </div>
          )}
          <button 
            onClick={logout}
            className={clsx(
              "flex items-center justify-center gap-3 text-[10px] font-black text-rose-600 uppercase tracking-[0.2em] bg-white border border-rose-100 rounded-2xl hover:bg-rose-50 hover:border-rose-200 transition-all duration-300 shadow-xl shadow-rose-500/5 active:scale-[0.98]",
              isSidebarCollapsed ? "w-10 h-10 mx-auto" : "w-full px-6 py-3 lg:py-4"
            )}
            title="Đăng xuất"
          >
            <LogOut className="w-4 h-4" />
            {!isSidebarCollapsed && "Đăng xuất"}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-4 bg-white border-b border-gray-100 shadow-sm z-30">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <span className="font-black text-gray-900 uppercase tracking-tighter text-sm">Auto Meta</span>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>

        <AnimatePresence>
          {isAutoSyncing && (
            <motion.div 
              initial={{ y: -100 }}
              animate={{ y: 0 }}
              exit={{ y: -100 }}
              className="absolute top-0 left-0 right-0 bg-blue-600 px-4 lg:px-6 py-2 lg:py-3 flex items-center justify-center gap-2 lg:gap-3 text-[9px] lg:text-[10px] font-black text-white uppercase tracking-widest z-20 shadow-2xl shadow-blue-500/20"
            >
              <RefreshCw className="w-3 h-3 lg:w-4 lg:h-4 animate-spin flex-shrink-0" />
              <span className="truncate">Đang tự động đồng bộ dữ liệu...</span>
            </motion.div>
          )}
          {error && (
            <motion.div 
              initial={{ y: -100 }}
              animate={{ y: 0 }}
              exit={{ y: -100 }}
              className="absolute top-0 left-0 right-0 bg-rose-500 px-4 lg:px-6 py-2 lg:py-3 flex items-center justify-center gap-2 lg:gap-3 text-[9px] lg:text-[10px] font-black text-white uppercase tracking-widest z-20 shadow-2xl shadow-rose-500/20"
            >
              <AlertTriangle className="w-3 h-3 lg:w-4 lg:h-4 flex-shrink-0" />
              <span className="truncate">Lỗi tải dữ liệu: {error}</span>
            </motion.div>
          )}
        </AnimatePresence>
        <div className={clsx("flex-1 flex flex-col overflow-y-auto transition-all duration-500", (isAutoSyncing || error) && "mt-8 lg:mt-12")}>
          <Outlet />
        </div>
      </main>
    </div>
  );
};
