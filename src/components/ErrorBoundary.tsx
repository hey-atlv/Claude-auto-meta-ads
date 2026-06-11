import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-2xl p-8 max-w-lg w-full text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 mb-4 uppercase tracking-tight">
              Đã có lỗi xảy ra
            </h1>
            <p className="text-sm text-gray-500 mb-8">
              Hệ thống gặp sự cố không mong muốn. Vui lòng tải lại trang hoặc liên hệ quản trị viên nếu vấn đề vẫn tiếp diễn.
            </p>
            <div className="bg-gray-50 rounded-xl p-4 mb-8 text-left overflow-auto max-h-32">
              <p className="text-xs font-mono text-red-600 break-words">
                {this.state.error?.message || 'Unknown error'}
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all duration-200 shadow-lg shadow-blue-500/30"
            >
              <RefreshCw className="w-4 h-4" />
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
