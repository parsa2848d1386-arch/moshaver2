'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useMessages } from '@/hooks/useMessages';
import { useToast } from '@/hooks/useToast';
import { useTyping } from '@/hooks/useTyping';
import type { Message, ChatType, ActiveTab, ToneScore, UserSettings, ConflictSession, SharedGoal, CalendarEvent, DailyQuestion as DailyQuestionType, UserProfile } from '@/types';
import { MOODS } from '@/constants';

// ===== COMPONENTS =====
import ToastContainer from '@/components/common/Toast';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import OfflineBanner from '@/components/common/OfflineBanner';
import ChatHeader from '@/components/chat/ChatHeader';
import MessageList from '@/components/chat/MessageList';
import ChatInput from '@/components/chat/ChatInput';
import SearchBar from '@/components/chat/SearchBar';
import ConflictMode from '@/components/chat/ConflictMode';
import SettingsPanel from '@/components/settings/SettingsPanel';
import DailyQuestion from '@/components/engagement/DailyQuestion';
import SharedCalendar from '@/components/engagement/SharedCalendar';
import GoalSetting from '@/components/engagement/GoalSetting';
import ApologyGuide from '@/components/engagement/ApologyGuide';
import ExerciseLibrary from '@/components/engagement/ExerciseLibrary';
import MoodTracker from '@/components/engagement/MoodTracker';
import WeeklyReport from '@/components/insights/WeeklyReport';
import Sidebar from '@/components/layout/Sidebar';
import { motion, AnimatePresence } from 'framer-motion';
import GeminiModelSelector from '@/components/gemini-ui/GeminiModelSelector';
import { Menu } from 'lucide-react';

// ===== MAIN PAGE =====
export default function ChatPage() {
  const router = useRouter();
  const { user, profile, loading, error, saveSettings, logout, updateProfile } = useAuth();
  const { toasts, showToast } = useToast();

  // ===== CORE STATES =====
  const [chatType, setChatType] = useState<ChatType>('shared');
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [aiTyping, setAiTyping] = useState(false);
  const [selectedMood, setSelectedMood] = useState('');
  const [streamingText, setStreamingText] = useState('');

  // ===== FEATURE STATES =====
  const [replyTo, setReplyTo] = useState<Message['replyTo'] | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [toneWarning, setToneWarning] = useState<ToneScore | null>(null);
  const [perspectivePopup, setPerspectivePopup] = useState<{ show: boolean; text: string; loading: boolean }>({ show: false, text: '', loading: false });
  const [showConflictMode, setShowConflictMode] = useState(false);
  const [conflictSession, setConflictSession] = useState<ConflictSession | null>(null);

  // ===== ENGAGEMENT STATES =====
  const [dailyQuestion, setDailyQuestion] = useState<string>('');
  const [goals, setGoals] = useState<SharedGoal[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<any>(null);
  const [showApologyGuide, setShowApologyGuide] = useState(false);
  const [showExercises, setShowExercises] = useState(false);
  const [moodHistory, setMoodHistory] = useState<any[]>([]);

  // ===== SETTINGS STATES =====
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
  const [customModelName, setCustomModelName] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [dndEnabled, setDndEnabled] = useState(false);

  // ===== DIALOG STATES =====
  const [confirmDialog, setConfirmDialog] = useState<{ show: boolean; type: string }>({ show: false, type: '' });

  // ===== HOOKS =====
  const { messages, loading: msgsLoading, hasMore, loadMore, sendMessage, editMessage, deleteMessage, togglePin, addReaction, searchMessages, clearChat } = useMessages(user?.uid || null, chatType);
  const { handleTypingStart } = useTyping(user?.uid || null, chatType);

  // ===== THEME =====
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('moshaver-theme', theme);
  }, [theme]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('moshaver-theme') as 'dark' | 'light' | null;
    if (savedTheme) setTheme(savedTheme);
  }, []);

  // ===== LOAD SETTINGS FROM PROFILE =====
  useEffect(() => {
    if (profile?.settings) {
      setSelectedModel(profile.settings.aiModel || 'gemini-2.5-flash');
      setCustomApiKey(profile.settings.customApiKey || '');
      setCustomModelName(profile.settings.customModelName || '');
      if (profile.settings.theme) setTheme(profile.settings.theme);
      if (profile.settings.dndEnabled) setDndEnabled(profile.settings.dndEnabled);
    }
  }, [profile]);

  // ===== LOAD ENGAGEMENT DATA =====
  useEffect(() => {
    if (!user) return;
    
    let isSubscribed = true;

    const loadData = async () => {
      try {
        const { collection, getDocs, doc, getDoc, setDoc, updateDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');

        // Load daily question
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 0);
        const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
        const DAILY_QUESTIONS = [
          'امروز از چه چیزی ممنون هستی؟',
          'یک خاطره خوب از هفته گذشته تعریف کن.',
          'اگر فردا آخرین روز زندگیت بود، چه کاری انجام می‌دادی؟',
          'چه چیزی باعث می‌شود احساس امنیت کنی؟',
          'یک چیز تعریف کن که شریکت اخیراً انجام داده و خوشحالت کرده.'
        ];
        const qIndex = dayOfYear % DAILY_QUESTIONS.length;
        if (isSubscribed) setDailyQuestion(DAILY_QUESTIONS[qIndex]);

        // Load goals
        const goalsSnap = await getDocs(collection(db, 'goals'));
        if (isSubscribed) {
          const loadedGoals = goalsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
          setGoals(loadedGoals.filter((g) => g.uid === user.uid || g.createdBy === user.uid));
        }

        // Load calendar
        const calSnap = await getDocs(collection(db, 'calendar'));
        if (isSubscribed) {
          const loadedCal = calSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
          setCalendarEvents(loadedCal.filter((c) => c.uid === user.uid || c.createdBy === user.uid));
        }
        
        // Load mood
        const moodSnap = await getDocs(collection(db, 'mood'));
        if (isSubscribed) {
          const loadedMood = moodSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
          setMoodHistory(loadedMood.filter((m) => m.uid === user.uid));
        }
        
      } catch (err) {
        console.error("Error loading engagement data:", err);
      }
    };
    
    loadData();
    
    return () => {
      isSubscribed = false;
    };
  }, [user]);

  // ===== REGISTER SERVICE WORKER (PWA) =====
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    }
  }, []);

  // ===== SEND MESSAGE WITH STREAMING =====
  const handleSendMessage = useCallback(async (text: string, inputMood?: string) => {
    if (!text.trim() || !user || !profile) return;

    setAiTyping(true);
    setToneWarning(null);

    const messageData = {
      text: text.trim(),
      senderId: user.uid,
      senderName: profile.displayName,
      senderRole: profile.role,
      mood: inputMood || undefined,
      replyTo: replyTo || undefined,
    };

    setReplyTo(null);

    try {
      // Save user message
      await sendMessage(messageData);

      // Get AI response via streaming
      const actualModel = selectedModel === 'custom' ? customModelName : selectedModel;
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages.slice(-20), { ...messageData, createdAt: new Date().toISOString() }],
          chatType,
          userDisplayName: profile.displayName,
          customModel: actualModel,
          customApiKey: customApiKey || undefined,
          currentMood: messageData.mood,
        }),
      });

      if (!response.ok) throw new Error('مشکلی در پاسخ‌دهی هوش مصنوعی پیش آمد.');

      // Read streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      if (reader) {
        setStreamingText('');
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          // Parse SSE data
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') break;
              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  fullText += parsed.text;
                  setStreamingText(fullText);
                }
              } catch {
                fullText += data;
                setStreamingText(fullText);
              }
            }
          }
        }
      }

      // Save AI response as message
      if (fullText) {
        await sendMessage({
          text: fullText,
          senderId: 'ai',
          senderName: 'مشاور همراه',
          senderRole: 'counselor',
        });
      }
      setStreamingText('');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'خطا در ارسال پیام', 'error');
      // Fallback to non-streaming
      try {
        const actualModel = selectedModel === 'custom' ? customModelName : selectedModel;
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: messages.slice(-20),
            chatType,
            userDisplayName: profile.displayName,
            customModel: actualModel,
            customApiKey: customApiKey || undefined,
            currentMood: selectedMood,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          await sendMessage({
            text: data.text,
            senderId: 'ai',
            senderName: 'مشاور همراه',
            senderRole: 'counselor',
          });
        }
      } catch (fallbackErr) {
        console.error('Fallback also failed:', fallbackErr);
      }
    } finally {
      setAiTyping(false);
    }
  }, [user, profile, messages, chatType, selectedMood, replyTo, selectedModel, customModelName, customApiKey, sendMessage, showToast]);

  // ===== TONE ANALYSIS =====
  const handleAnalyzeTone = useCallback(async (text: string) => {
    if (!text.trim() || text.length < 5) {
      setToneWarning(null);
      return;
    }
    try {
      const res = await fetch('/api/tone-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, apiKey: customApiKey || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.level !== 'safe') {
          setToneWarning(data);
        } else {
          setToneWarning(null);
        }
      }
    } catch (err) {
      console.error('Tone analysis error:', err);
    }
  }, [customApiKey]);

  // ===== NVC TRANSLATE =====
  const handleNvcTranslate = useCallback(async (text: string): Promise<string> => {
    try {
      const res = await fetch('/api/nvc-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, apiKey: customApiKey || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.nvcText || text;
      }
    } catch (err) {
      console.error('NVC translate error:', err);
    }
    return text;
  }, [customApiKey]);

  // ===== PERSPECTIVE ANALYSIS =====
  const handlePerspective = useCallback(async (message: Message) => {
    setPerspectivePopup({ show: true, text: '', loading: true });
    try {
      const context = messages.slice(-5).map((m) => ({
        text: m.text,
        senderRole: m.senderRole,
        senderName: m.senderName,
      }));
      const res = await fetch('/api/perspective', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageText: message.text,
          senderRole: message.senderRole,
          context,
          apiKey: customApiKey || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPerspectivePopup({ show: true, text: data.perspective, loading: false });
      } else {
        setPerspectivePopup({ show: false, text: '', loading: false });
        showToast('خطا در تحلیل دیدگاه', 'error');
      }
    } catch (err) {
      setPerspectivePopup({ show: false, text: '', loading: false });
      showToast('خطا در تحلیل دیدگاه', 'error');
    }
  }, [messages, customApiKey, showToast]);

  // ===== CONFLICT MODE =====
  const handleStartConflict = useCallback(async (topic: string) => {
    try {
      const res = await fetch('/api/conflict-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', topic, uid: user?.uid }),
      });
      if (res.ok) {
        const session = await res.json();
        setConflictSession(session);
        setShowConflictMode(true);
      }
    } catch (err) {
      showToast('خطا در شروع حل تعارض', 'error');
    }
  }, [user, showToast]);

  const handleNextTurn = useCallback(async () => {
    if (!conflictSession?.id) return;
    try {
      const res = await fetch('/api/conflict-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'next_turn', sessionId: conflictSession.id, uid: user?.uid }),
      });
      if (res.ok) {
        const updated = await res.json();
        setConflictSession(updated);
      }
    } catch (err) {
      showToast('خطا', 'error');
    }
  }, [conflictSession, user, showToast]);

  const handleEndConflict = useCallback(async () => {
    if (!conflictSession?.id) return;
    try {
      await fetch('/api/conflict-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end', sessionId: conflictSession.id, uid: user?.uid }),
      });
      setConflictSession(null);
      setShowConflictMode(false);
      showToast('جلسه حل تعارض پایان یافت ✅', 'success');
    } catch (err) {
      showToast('خطا', 'error');
    }
  }, [conflictSession, user, showToast]);

  // ===== COPY MESSAGE =====
  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('پیام کپی شد', 'success');
    } catch {
      showToast('خطا در کپی', 'error');
    }
  }, [showToast]);

  // ===== SAVE SETTINGS =====
  const handleSaveSettings = useCallback(async (profileUpdate: Partial<UserProfile>, settings: UserSettings) => {
    try {
      await saveSettings(profileUpdate.displayName || profile!.displayName, profileUpdate.avatar || profile!.avatar, settings);
      setSelectedModel(settings.aiModel);
      setCustomApiKey(settings.customApiKey);
      setCustomModelName(settings.customModelName);
      setTheme(settings.theme);
      showToast('تنظیمات ذخیره شد ✅', 'success');
    } catch (err: any) {
      showToast(err.message || 'خطا در ذخیره', 'error');
    }
  }, [saveSettings, showToast]);

  // ===== CLEAR CHAT =====
  const handleClearChat = useCallback(async () => {
    setConfirmDialog({ show: false, type: '' });
    try {
      await clearChat();
      showToast('تاریخچه چت پاک شد 🗑️', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  }, [clearChat, showToast]);

  // ===== EXPORT =====
  const handleExport = useCallback(async () => {
    try {
      const res = await fetch(`/api/export?chatType=${chatType}&uid=${user?.uid}&format=text`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `moshaver-chat-${chatType}-${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('فایل دانلود شد ✅', 'success');
      }
    } catch (err) {
      showToast('خطا در دانلود', 'error');
    }
  }, [chatType, user, showToast]);

  // ===== LOGOUT =====
  const handleLogout = useCallback(async () => {
    setConfirmDialog({ show: false, type: '' });
    await logout();
  }, [logout]);

  // ===== TAG MEMORY =====
  const handleTagMemory = useCallback(async (messageId: string, messageText: string, tag: string) => {
    try {
      await fetch('/api/memory-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          messageText,
          tag,
          taggedBy: user?.uid,
          uid: user?.uid,
        }),
      });
      showToast('خاطره ذخیره شد 💛', 'success');
    } catch {
      showToast('خطا', 'error');
    }
  }, [user, showToast]);

  // ===== GOAL HANDLERS =====
  const handleAddGoal = useCallback(async (goal: Omit<SharedGoal, 'id' | 'createdAt' | 'progress' | 'status' | 'createdBy'>) => {
    try {
      const { collection, addDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const goalData = { ...goal, createdBy: user?.uid, uid: user?.uid, createdAt: new Date().toISOString(), progress: 0, status: 'active' };
      const docRef = await addDoc(collection(db, 'goals'), goalData);
      setGoals((prev) => [...prev, { id: docRef.id, ...goalData } as SharedGoal]);
      showToast('هدف اضافه شد ✅', 'success');
    } catch { showToast('خطا', 'error'); }
  }, [user, showToast]);

  const handleUpdateGoal = useCallback(async (goalId: string, updates: Partial<SharedGoal>) => {
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      await updateDoc(doc(db, 'goals', goalId), updates);
      setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, ...updates } : g)));
    } catch { showToast('خطا', 'error'); }
  }, [showToast]);

  // ===== CALENDAR HANDLERS =====
  const handleAddEvent = useCallback(async (event: Omit<CalendarEvent, 'id' | 'createdBy'>) => {
    try {
      const { collection, addDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const eventData = { ...event, createdBy: user?.uid, uid: user?.uid };
      const docRef = await addDoc(collection(db, 'calendar'), eventData);
      setCalendarEvents((prev) => [...prev, { id: docRef.id, ...eventData } as CalendarEvent]);
      showToast('رویداد اضافه شد 📅', 'success');
    } catch { showToast('خطا', 'error'); }
  }, [user, showToast]);

  const handleDeleteEvent = useCallback(async (eventId: string) => {
    try {
      const { doc, deleteDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      await deleteDoc(doc(db, 'calendar', eventId));
      setCalendarEvents((prev) => prev.filter((e) => e.id !== eventId));
    } catch { showToast('خطا', 'error'); }
  }, [showToast]);

  // ===== SAVE MOOD =====
  const handleMoodChange = useCallback(async (mood: string) => {
    setSelectedMood(mood);
    if (user) {
      try {
        const { collection, addDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        await addDoc(collection(db, 'mood'), { uid: user.uid, mood, date: new Date().toISOString().split('T')[0] });
      } catch (e) {
        console.error(e);
      }
    }
  }, [user]);

  // ===== ERROR OR CONFIG MISSING =====
  if (error === 'FIREBASE_CONFIG_MISSING') {
    return (
      <div className="w-full min-h-screen bg-[#09090B] flex items-center justify-center p-4 relative overflow-hidden font-sans" dir="rtl">
        {/* Background Glowing Aura */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 opacity-15">
          <div className="absolute top-[10%] left-[10%] w-[60vw] h-[60vw] rounded-full blur-[100px] bg-gradient-to-br from-amber-600 via-orange-600 to-transparent animate-pulse" />
          <div className="absolute bottom-[10%] right-[10%] w-[60vw] h-[60vw] rounded-full blur-[100px] bg-gradient-to-bl from-rose-500 via-yellow-600 to-transparent" />
        </div>

        <div className="max-w-2xl w-full bg-[#121214] border border-amber-500/20 rounded-3xl p-6 md:p-8 shadow-2xl z-10 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-3xl mb-6 text-amber-500 animate-bounce">
            🔑
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-100 mb-2 tracking-tight">پیکربندی فایربیس (Firebase) مورد نیاز است</h1>
          <p className="text-zinc-400 text-sm md:text-base mb-6 leading-relaxed">
            جهت اجرای امن و ثبت اطلاعات گفتگوها و تفاهم پارسا و ملیکا، باید مشخصات پروژه فایربیس خود را به عنوان متغیر محیطی (Environment Variable) در پنل تنظیمات کلاینت و سرور گوگل وارد کنید.
          </p>

          <div className="w-full bg-[#18181C] rounded-2xl border border-neutral-800 p-4 text-right mb-6">
            <h3 className="text-sm font-bold text-amber-500 mb-3 flex items-center gap-2">
              <span>📋</span> متغیرهای کلاینت فایربیس برای پنل Settings:
            </h3>
            <div className="font-mono text-xs text-zinc-300 space-y-2 select-all overflow-x-auto p-2 bg-[#09090B] rounded-xl border border-neutral-800/40">
              <p><span className="text-amber-500/80">NEXT_PUBLIC_FIREBASE_API_KEY</span>=مقدار کلید</p>
              <p><span className="text-amber-500/80">NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN</span>=مقدار دامین</p>
              <p><span className="text-amber-500/80">NEXT_PUBLIC_FIREBASE_PROJECT_ID</span>=شناسه پروژه</p>
              <p><span className="text-amber-500/80">NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET</span>=باکت ذخیره</p>
              <p><span className="text-amber-500/80">NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID</span>=شناسه فرستنده</p>
              <p><span className="text-amber-500/80">NEXT_PUBLIC_FIREBASE_APP_ID</span>=شناسه برنامه</p>
            </div>
            <h3 className="text-sm font-bold text-orange-500 mt-4 mb-3 flex items-center gap-2">
              <span>🔒</span> متغیرهای سروری (Secrets):
            </h3>
            <div className="font-mono text-xs text-zinc-300 space-y-2 select-all overflow-x-auto p-2 bg-[#09090B] rounded-xl border border-neutral-800/40">
              <p><span className="text-orange-400/80">FIREBASE_SERVICE_ACCOUNT_JSON</span>=(کلید JSON دانلود شده خصوصی سرور فایربیس)</p>
              <p><span className="text-orange-400/80">GEMINI_API_KEY</span>=(کلید هوش مصنوعی جمینای)</p>
            </div>
          </div>

          <div className="text-right w-full space-y-3 mb-6 pr-2">
            <h4 className="text-sm font-bold text-zinc-200">🚀 مراحل راه‌اندازی سریع:</h4>
            <div className="text-xs text-zinc-400 space-y-2 leading-relaxed font-sans">
              <p><strong>۱.</strong> در پنل فایربیس پروژه خود را بسازید و وارد بخش <b>Authentication</b> شده و ورود با ایمیل و گوگل را فعال کنید.</p>
              <p><strong>۲.</strong> در تنظیمات پروژه (Project Settings)، دکمه افزودن برنامه تحت وب (Web) را بزنید و فیلدهای بالا (apiKey و غیره) را کپی کنید.</p>
              <p><strong>۳.</strong> در بالای همین صفحه (AI Studio)، دکمه چرخ‌دنده <b>Settings</b> را کلیک کرده و متغیرهای فوق را اضافه کنید.</p>
            </div>
          </div>

          <div className="w-full pt-4 border-t border-neutral-800 flex justify-between items-center text-xs text-zinc-500">
            <span>ماورا نخبگان - مشاور زوجین</span>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded-xl transition-all duration-300 font-medium"
            >
              🔄 بررسی مجدد اتصال
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== LOADING =====
  if (loading) {
    return (
      <div className="w-full h-screen bg-[#09090B] flex items-center justify-center relative overflow-hidden font-sans" dir="rtl">
        {/* Background Glowing Aura */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 opacity-20">
          <div className="absolute -top-[20%] -left-[10%] w-[80vw] h-[80vw] rounded-full blur-[120px] bg-gradient-to-br from-indigo-600 via-purple-600 to-transparent" />
          <div className="absolute -bottom-[20%] -right-[10%] w-[80vw] h-[80vw] rounded-full blur-[120px] bg-gradient-to-bl from-rose-600 via-pink-650 to-transparent" />
        </div>
        <div className="flex flex-col items-center z-10">
          <div className="relative w-20 h-20 mb-8">
            <div className="absolute inset-0 rounded-full border-[3px] border-indigo-500/10" />
            <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-indigo-500 border-r-purple-500 animate-spin [animation-duration:1s]" />
            <div className="absolute inset-3 rounded-full border-[3px] border-transparent border-b-rose-500 border-l-pink-500 animate-spin [animation-duration:1.5s] [animation-direction:reverse]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl">🕯️</span>
            </div>
          </div>
          <h2 className="text-zinc-100 font-extrabold text-xl mb-2 tracking-tight">مشاور رابطه</h2>
          <p className="text-zinc-400 font-medium text-xs tracking-wide bg-gradient-to-r from-zinc-400 via-zinc-300 to-zinc-400 bg-clip-text text-transparent animate-pulse uppercase">سیستم در حال بارگذاری...</p>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  // ===== RENDER =====
  return (
    <ErrorBoundary>
      <div className="relative w-full h-screen bg-[#0A0A0A] text-zinc-100 overflow-hidden font-sans" dir="rtl">
        <ToastContainer toasts={toasts} />
        <OfflineBanner />

        {/* Background Aura (Fluid Glowing Gradient) */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <motion.div
            animate={{
              opacity: aiTyping ? 0.4 : 0.1,
              scale: aiTyping ? [1, 1.1, 1] : 1,
              rotate: aiTyping ? [0, 5, -5, 0] : 0,
            }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -top-[20%] -left-[10%] w-[70vw] h-[70vw] rounded-full blur-[100px] bg-gradient-to-br from-amber-600/15 via-orange-500/10 to-transparent mix-blend-screen"
          />
          <motion.div
            animate={{
              opacity: aiTyping ? 0.3 : 0,
              scale: aiTyping ? [1, 1.2, 1] : 0.8,
              x: aiTyping ? [0, 50, 0] : 0,
            }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            className="absolute top-[10%] -right-[10%] w-[60vw] h-[60vw] rounded-full blur-[100px] bg-gradient-to-bl from-amber-500/15 via-zinc-800/10 to-transparent mix-blend-screen"
          />
          <motion.div
            animate={{
              opacity: aiTyping ? 0.2 : 0,
              y: aiTyping ? [0, -30, 0] : 0,
            }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute bottom-0 left-[20%] w-[80vw] h-[50vw] rounded-full blur-[120px] bg-gradient-to-t from-orange-500/10 to-transparent mix-blend-screen"
          />
        </div>

        {/* Header */}
        <header className="w-full px-4 py-3 flex justify-between items-center z-30 shrink-0 bg-[#0A0A0A]/60 backdrop-blur-xl border-b border-neutral-800 shadow-lg">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="p-2.5 rounded-2xl bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300 transition-all border border-neutral-800 active:scale-95 cursor-pointer"
            >
              <Menu size={20} />
            </button>
            <div className="hidden sm:flex flex-col">
              <span className="text-sm font-serif font-bold tracking-widest uppercase bg-gradient-to-l from-orange-400 to-amber-500 bg-clip-text text-transparent">
                MOSHAVER
              </span>
              <span className="text-[9px] uppercase tracking-[0.25em] text-neutral-500 -mt-1">
                Elite Counselor Group
              </span>
            </div>
          </div>

          <GeminiModelSelector 
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
            thinkingLevel="standard"
            onSelectThinkingLevel={() => {}}
          />

          <div className={`w-10 h-10 rounded-full bg-gradient-to-tr ${
            profile.role === 'parsa' ? 'from-blue-600 to-indigo-500 shadow-md shadow-blue-500/20' : 'from-rose-600 to-pink-500 shadow-md shadow-rose-500/20'
          } flex items-center justify-center text-white font-bold cursor-pointer hover:scale-105 transition-transform border border-white/10`}>
            {profile.avatar || 'P'}
          </div>
        </header>

        {/* CONFIRM DIALOGS */}
        {confirmDialog.show && confirmDialog.type === 'clear' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <ConfirmDialog
              title="🗑️ پاک کردن تاریخچه"
              message={`آیا مطمئنید که می‌خواهید تمام پیام‌های ${chatType === 'shared' ? 'جلسه دو نفره' : 'چت خصوصی'} را پاک کنید؟`}
              onConfirm={handleClearChat}
              onCancel={() => setConfirmDialog({ show: false, type: '' })}
              confirmText="بله، پاک کن"
              danger
            />
          </div>
        )}
        {confirmDialog.show && confirmDialog.type === 'logout' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <ConfirmDialog
              title="🚪 خروج از حساب"
              message="آیا می‌خواهید از حساب کاربری خود خارج شوید؟"
              onConfirm={handleLogout}
              onCancel={() => setConfirmDialog({ show: false, type: '' })}
              confirmText="خروج"
              danger
            />
          </div>
        )}

        {/* PERSPECTIVE POPUP */}
        <AnimatePresence>
          {perspectivePopup.show && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" 
              onClick={() => setPerspectivePopup({ show: false, text: '', loading: false })}
            >
              <motion.div 
                initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
                className="bg-zinc-900 border border-white/10 rounded-3xl p-6 shadow-2xl max-w-sm w-full" 
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-bold text-white mb-4">🔍 دیدگاه طرف مقابل</h3>
                {perspectivePopup.loading ? (
                  <div className="flex flex-col items-center py-6">
                    <div className="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-3" />
                    <p className="text-zinc-500 text-sm">در حال تحلیل...</p>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {perspectivePopup.text}
                  </p>
                )}
                <button
                  className="w-full mt-6 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl py-2 transition-colors"
                  onClick={() => setPerspectivePopup({ show: false, text: '', loading: false })}
                >
                  بستن
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CONFLICT MODE */}
        {showConflictMode && conflictSession && (
          <div className="fixed inset-0 z-40 bg-zinc-950/90 backdrop-blur-md overflow-y-auto pt-20 pb-10 px-4">
            <ConflictMode
              isActive={showConflictMode}
              currentSpeaker={conflictSession.currentSpeaker}
              round={conflictSession.round}
              topic={conflictSession.topic}
              onNextTurn={handleNextTurn}
              onEnd={handleEndConflict}
            />
          </div>
        )}

        {/* APOLOGY GUIDE */}
        {showApologyGuide && (
          <div className="fixed inset-0 z-40 bg-zinc-950/90 backdrop-blur-md overflow-y-auto pt-20 pb-10 px-4">
            <ApologyGuide onClose={() => setShowApologyGuide(false)} />
          </div>
        )}

        {/* EXERCISE LIBRARY */}
        {showExercises && (
          <div className="fixed inset-0 z-40 bg-zinc-950/90 backdrop-blur-md overflow-y-auto pt-20 pb-10 px-4">
            <ExerciseLibrary onClose={() => setShowExercises(false)} />
          </div>
        )}

        <Sidebar
          profile={profile}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onLogout={() => setConfirmDialog({ show: true, type: 'logout' })}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
        />

        {error && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-red-500/20 text-red-400 border border-red-500/50 px-4 py-2 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* MAIN CONTENT AREA */}
        <div className={`flex-1 w-full max-w-3xl mx-auto px-4 sm:px-8 z-20 relative ${activeTab === 'chat' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto scrollbar-hide pb-20'}`}>

            {/* ===== SETTINGS TAB ===== */}
            {activeTab === 'settings' && (
              <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/5 rounded-3xl p-6 mt-4">
                <SettingsPanel
                  profile={profile}
                  settings={{
                    aiModel: selectedModel,
                    customApiKey,
                    customModelName,
                    theme,
                    dndEnabled,
                  }}
                  onSave={handleSaveSettings}
                  onClearChat={() => setConfirmDialog({ show: true, type: 'clear' })}
                  onExport={handleExport}
                />
              </div>
            )}

            {/* ===== ENGAGEMENT TAB ===== */}
            {activeTab === 'engagement' && (
              <div className="flex flex-col gap-6 mt-4 pb-20">
                {dailyQuestion && (
                  <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/5 rounded-3xl p-6">
                    <DailyQuestion
                      question={dailyQuestion}
                      onAnswer={async (answer) => {
                        try {
                          const { doc, getDoc, setDoc, updateDoc } = await import('firebase/firestore');
                          const { db } = await import('@/lib/firebase');
                          const dateStr = new Date().toISOString().split('T')[0];
                          const docRef = doc(db, 'daily_questions', dateStr);
                          const snapshot = await getDoc(docRef);
                          if (snapshot.exists()) {
                            await updateDoc(docRef, { [`answers.${user?.uid}`]: answer });
                          } else {
                            await setDoc(docRef, { question: dailyQuestion, date: dateStr, answers: { [user?.uid || '']: answer }, createdAt: new Date().toISOString() });
                          }
                          showToast('پاسخ ثبت شد ✅', 'success');
                        } catch { showToast('خطا', 'error'); }
                      }}
                    />
                  </div>
                )}

                <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/5 rounded-3xl p-6">
                  <MoodTracker
                    selectedMood={selectedMood}
                    onMoodChange={handleMoodChange}
                    moodHistory={moodHistory}
                  />
                </div>

                <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/5 rounded-3xl p-6">
                  <GoalSetting
                    goals={goals}
                    onAdd={handleAddGoal}
                    onUpdate={(id, progress) => handleUpdateGoal(id, { progress })}
                    onComplete={(id) => handleUpdateGoal(id, { status: 'completed', progress: 100 })}
                  />
                </div>

                <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/5 rounded-3xl p-6">
                  <SharedCalendar
                    events={calendarEvents}
                    onAddEvent={handleAddEvent}
                    onDeleteEvent={handleDeleteEvent}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <button className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 p-4 rounded-2xl transition-colors font-medium text-sm flex items-center justify-center gap-2" onClick={() => setShowApologyGuide(true)}>
                    🤝 پروتکل آشتی
                  </button>
                  <button className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 p-4 rounded-2xl transition-colors font-medium text-sm flex items-center justify-center gap-2" onClick={() => setShowExercises(true)}>
                    🧘 کتابخانه تمرین‌ها
                  </button>
                  <button className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 p-4 rounded-2xl transition-colors font-medium text-sm flex items-center justify-center gap-2" onClick={() => {
                    const topic = prompt('موضوع اختلاف چیست؟');
                    if (topic) handleStartConflict(topic);
                  }}>
                    ⚖️ شروع حل تعارض
                  </button>
                </div>
              </div>
            )}

            {/* ===== INSIGHTS TAB ===== */}
            {activeTab === 'insights' && (
              <div className="flex flex-col gap-6 mt-4 pb-20">
                <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/5 rounded-3xl p-6">
                  <WeeklyReport report={weeklyReport} />
                </div>
                <div className="flex gap-4">
                  <button
                    className="flex-1 bg-blue-500 hover:bg-blue-600 text-white rounded-xl py-3 font-medium transition-colors text-sm"
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/weekly-report?uid=${user?.uid}`);
                        if (res.ok) {
                          const data = await res.json();
                          setWeeklyReport(data);
                        }
                      } catch { showToast('خطا در دریافت گزارش', 'error'); }
                    }}
                  >
                    📊 دریافت گزارش هفتگی
                  </button>
                  <button
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl py-3 font-medium transition-colors text-sm"
                    onClick={() => router.push('/insights')}
                  >
                    📈 داشبورد تحلیل کامل
                  </button>
                </div>
              </div>
            )}

            {/* ===== CHAT TAB ===== */}
            {activeTab === 'chat' && (
              <>
                {/* SEARCH */}
                {showSearch && (
                  <div className="mb-4">
                    <SearchBar
                      onSearch={searchMessages}
                      onClose={() => setShowSearch(false)}
                      onGoToMessage={(msg) => {
                        setShowSearch(false);
                      }}
                    />
                  </div>
                )}

                {/* ROOM TABS */}
                <div className="flex bg-zinc-950/40 backdrop-blur-md rounded-2xl p-1.5 mb-5 border border-white/5 shadow-inner">
                  <button
                    className={`flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 ${
                      chatType === 'shared' 
                        ? 'bg-gradient-to-r from-blue-600/10 to-indigo-600/10 border border-blue-500/20 text-blue-400 shadow-[inset_0_0_12px_rgba(99,102,241,0.08)]' 
                        : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                    }`}
                    onClick={() => setChatType('shared')}
                  >
                    👥 جلسه دو نفره
                  </button>
                  <button
                    className={`flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 ${
                      chatType === 'private' 
                        ? 'bg-gradient-to-r from-rose-600/10 to-pink-600/10 border border-rose-500/20 text-pink-400 shadow-[inset_0_0_12px_rgba(236,72,153,0.08)]' 
                        : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                    }`}
                    onClick={() => setChatType('private')}
                  >
                    🔒 گفتگوی خصوصی
                  </button>
                </div>

                {/* MESSAGES */}
                <div className="flex-1 min-h-0 flex flex-col relative">
                  <MessageList
                    messages={messages}
                    loading={msgsLoading}
                    hasMore={hasMore}
                    onLoadMore={loadMore}
                    pinnedMessages={messages.filter((m) => m.isPinned)}
                    currentUserId={user?.uid || ''}
                    chatType={chatType}
                    aiTyping={aiTyping}
                    partnerTyping={false}
                    onCopy={handleCopy}
                    onReply={(msg) => setReplyTo({ id: msg.id || '', text: msg.text, senderName: msg.senderName })}
                    onEdit={(msg) => {
                      const newText = window.prompt('متن جدید پیام:', msg.text);
                      if (newText && newText !== msg.text) editMessage(msg.id || '', newText);
                    }}
                    onDelete={(msg) => deleteMessage(msg.id || '')}
                    onPin={(msg) => togglePin(msg.id || '', msg.isPinned || false)}
                    onReaction={(msg, emoji) => addReaction(msg.id || '', emoji, user?.uid || '')}
                    onTagMemory={(msg) => {
                      const tag = window.prompt('نام خاطره (مثلاً 💛 سالگرد آشنایی):');
                      if (tag) handleTagMemory(msg.id || '', msg.text, tag);
                    }}
                    onPerspective={handlePerspective}
                  />

                  {aiTyping && (
                    <motion.div 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="flex gap-4 items-center mt-2 w-full ml-auto mb-4"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center mr-2">
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
                          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M11.5 0C11.5 5.5 16 10 21.5 10C16 10 11.5 14.5 11.5 20C11.5 14.5 7 10 1.5 10C7 10 11.5 5.5 11.5 0Z" fill="currentColor"/>
                          </svg>
                        </motion.div>
                      </div>
                      <div className="flex gap-1.5">
                        <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }} className="w-2 h-2 rounded-full bg-blue-400" />
                        <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-2 h-2 rounded-full bg-purple-400" />
                        <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-2 h-2 rounded-full bg-emerald-400" />
                      </div>
                    </motion.div>
                  )}
                </div>
              </>
            )}
          </div>

        {/* BOTTOM INPUT AREA */}
        {activeTab === 'chat' && (
          <div className="shrink-0 w-full bg-gradient-to-t from-[#09090B] via-[#09090B] to-[#09090B]/40 z-30 relative pt-2">
            <ChatInput
              onSend={handleSendMessage}
              disabled={aiTyping}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              onVoiceSend={() => showToast('این قابلیت به زودی اضافه می‌شود', 'info')}
              onImageSend={() => showToast('این قابلیت به زودی اضافه می‌شود', 'info')}
              chatType={chatType}
              toneWarning={toneWarning}
              onAnalyzeTone={handleAnalyzeTone}
              onNvcTranslate={handleNvcTranslate}
              onTyping={handleTypingStart}
            />
          </div>
        )}

      </div>
    </ErrorBoundary>
  );
}
