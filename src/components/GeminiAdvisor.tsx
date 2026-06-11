import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, TrendingUp, TrendingDown, AlertCircle, Info, ChevronRight, BrainCircuit } from 'lucide-react';
import { getDashboardStrategy, AIStrategyResponse, AIInsight } from '../services/geminiService';

interface GeminiAdvisorProps {
  data: any;
  isVisible: boolean;
}

export const GeminiAdvisor: React.FC<GeminiAdvisorProps> = ({ data, isVisible }) => {
  const [strategy, setStrategy] = useState<AIStrategyResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getDashboardStrategy(data);
      if (res) {
        setStrategy(res);
      } else {
        setError("Không thể kết nối AI. Vui lòng kiểm tra API Key.");
      }
    } catch (e) {
      setError("Có lỗi xảy ra khi phân tích.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isVisible && !strategy && !isLoading) {
      analyze();
    }
  }, [isVisible, data]);

  const getStatusIcon = (status: AIInsight['status']) => {
    switch (status) {
      case 'positive': return <TrendingUp className="w-4 h-4 text-emerald-500" />;
      case 'warning': return <AlertCircle className="w-4 h-4 text-amber-500" />;
      case 'critical': return <AlertCircle className="w-4 h-4 text-rose-500" />;
      default: return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getStatusBg = (status: AIInsight['status']) => {
    switch (status) {
      case 'positive': return 'bg-emerald-50 border-emerald-100';
      case 'warning': return 'bg-amber-50 border-amber-100';
      case 'critical': return 'bg-rose-50 border-rose-100';
      default: return 'bg-blue-50 border-blue-100';
    }
  };

  if (!isVisible) return null;

  return (
    <div className="mb-8 overflow-hidden border bg-white/50 backdrop-blur-sm rounded-2xl border-slate-200">
      <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">AI Strategy Assistant</h3>
            <p className="text-xs text-slate-500">Phân tích dữ liệu thực tế bởi Gemini</p>
          </div>
        </div>
        <button 
          onClick={analyze}
          disabled={isLoading}
          className="px-3 py-1 text-xs font-medium text-indigo-600 transition-colors bg-indigo-50 rounded-full hover:bg-indigo-100 disabled:opacity-50"
        >
          {isLoading ? 'Đang phân tích...' : 'Làm mới phân tích'}
        </button>
      </div>

      <div className="p-6">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-12 flex flex-col items-center justify-center gap-4"
            >
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500 font-mono italic">AI is processing market trends...</p>
            </motion.div>
          ) : strategy ? (
            <motion.div 
              key="content"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Health Score</span>
                    <div className="h-1 flex-1 bg-slate-100 rounded-full overflow-hidden max-w-[100px]">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${strategy.overallHealth}%` }}
                        className={`h-full ${strategy.overallHealth > 70 ? 'bg-emerald-500' : strategy.overallHealth > 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                      />
                    </div>
                    <span className="text-lg font-mono font-bold">{strategy.overallHealth}/100</span>
                  </div>
                  <p className="text-slate-700 leading-relaxed italic border-l-2 border-slate-200 pl-4">
                    {strategy.summary}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {strategy.insights.map((insight, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className={`p-4 border rounded-xl ${getStatusBg(insight.status)}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusIcon(insight.status)}
                      <h4 className="text-sm font-bold text-slate-900">{insight.title}</h4>
                    </div>
                    <p className="text-sm text-slate-800 font-medium mb-1">{insight.recommendation}</p>
                    <p className="text-xs text-slate-500 leading-snug">{insight.reasoning}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : (
            <div className="py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">{error || "Sẵn sàng phân tích dữ liệu của bạn."}</p>
              {!error && (
                <button 
                  onClick={analyze}
                  className="mt-4 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all"
                >
                  Bắt đầu phân tích
                </button>
              )}
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
