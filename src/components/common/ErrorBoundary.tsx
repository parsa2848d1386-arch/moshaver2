'use client';

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="w-full min-h-screen bg-[#09090B] flex items-center justify-center p-4 relative overflow-hidden font-sans" dir="rtl">
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 opacity-15">
            <div className="absolute top-[10%] left-[10%] w-[60vw] h-[60vw] rounded-full blur-[100px] bg-gradient-to-br from-red-600 via-rose-600 to-transparent animate-pulse" />
            <div className="absolute bottom-[10%] right-[10%] w-[60vw] h-[60vw] rounded-full blur-[100px] bg-gradient-to-bl from-orange-500 via-yellow-600 to-transparent" />
          </div>

          <div className="max-w-md w-full bg-[#121214] border border-red-500/20 rounded-3xl p-6 md:p-8 shadow-2xl z-10 flex flex-col items-center text-center animate-fade-in relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500" />
            
            <div className="w-20 h-20 rounded-3xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-4xl mb-6 text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
              🛡️
            </div>
            
            <h1 className="text-2xl font-extrabold text-zinc-100 mb-3 tracking-tight">سیستم مدیریت خطا</h1>
            <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
              هوش مصنوعی مشاور متوجه یک خطای غیرمنتظره شد. سیستم در حال بازیابی است، لطفاً مجدداً تلاش کنید.
            </p>

            <div className="w-full bg-[#0A0A0A] rounded-2xl border border-neutral-800 p-4 text-right mb-6 relative group">
              <h3 className="text-sm font-bold text-red-500 mb-3 flex items-center gap-2">
                <span>⚠️</span> لاگ خطا (برای توسعه‌دهنده):
              </h3>
              <div className="font-mono text-xs text-zinc-400 space-y-1 overflow-x-auto p-2 bg-[#121214] rounded-xl border border-neutral-800/60 h-24 overflow-y-auto">
                <p dir="ltr" className="text-left text-red-400/80 break-words font-semibold">
                  {this.state.error?.name}: {this.state.error?.message}
                </p>
                {this.state.error?.stack && (
                  <p dir="ltr" className="text-left text-zinc-500 break-all mt-2">
                    {this.state.error.stack.split('\n')[1]}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={this.handleRetry}
              className="w-full py-3.5 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white rounded-xl transition-all duration-300 font-bold shadow-lg shadow-red-500/25 active:scale-95 flex justify-center items-center gap-2"
            >
              <span>♻️</span> بازیابی و تلاش مجدد سیستم
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full mt-3 py-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl transition-all duration-300 font-medium active:scale-95 text-sm"
            >
              بارگذاری مجدد کل صفحه
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
