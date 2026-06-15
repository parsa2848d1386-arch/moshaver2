'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  limit,
  startAfter,
  getDocs,
  doc,
  getDoc,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Message, ChatType, PaginatedResponse } from '@/types';
import { MESSAGE_PAGE_SIZE } from '@/constants';
import { toast } from 'sonner';

export function useMessages(uid: string | null, chatType: ChatType) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const unsubRef = useRef<(() => void) | null>(null);
  const oldestDocRef = useRef<QueryDocumentSnapshot | null>(null);

  // ===== REALTIME LISTENER (replaces polling) =====
  useEffect(() => {
    if (!uid) return;

    setTimeout(() => {
      setLoading(true);
    }, 0);

    const colPath =
      chatType === 'shared'
        ? 'shared_chats'
        : `private_chats/${uid}/messages`;

    const q = query(
      collection(db, colPath),
      orderBy('createdAt', 'desc'),
      limit(MESSAGE_PAGE_SIZE)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const msgs: Message[] = [];
        snapshot.forEach((d) => {
          msgs.push({ id: d.id, ...d.data() } as Message);
        });

        // Store oldest doc for pagination
        if (snapshot.docs.length > 0) {
          oldestDocRef.current = snapshot.docs[snapshot.docs.length - 1];
        }

        setMessages(msgs.reverse()); // show oldest first
        setHasMore(snapshot.docs.length >= MESSAGE_PAGE_SIZE);
        setLoading(false);
      },
      (err) => {
        console.error('Realtime listener error:', err);
        setLoading(false);
        toast.error('خطا در دریافت لحظه‌ای پیام‌ها');
      }
    );

    unsubRef.current = unsub;
    return () => unsub();
  }, [uid, chatType]);

  // ===== LOAD MORE (PAGINATION) =====
  const loadMore = useCallback(async () => {
    if (!uid || !oldestDocRef.current || !hasMore) return;

    const colPath =
      chatType === 'shared'
        ? 'shared_chats'
        : `private_chats/${uid}/messages`;

    const q = query(
      collection(db, colPath),
      orderBy('createdAt', 'desc'),
      startAfter(oldestDocRef.current),
      limit(MESSAGE_PAGE_SIZE)
    );

    const snapshot = await getDocs(q);
    const older: Message[] = [];
    snapshot.forEach((d) => {
      older.push({ id: d.id, ...d.data() } as Message);
    });

    if (snapshot.docs.length > 0) {
      oldestDocRef.current = snapshot.docs[snapshot.docs.length - 1];
    }

    setHasMore(snapshot.docs.length >= MESSAGE_PAGE_SIZE);
    setMessages((prev) => [...older.reverse(), ...prev]);
  }, [uid, chatType, hasMore]);

  // ===== SEND MESSAGE =====
  const sendMessage = useCallback(
    async (data: {
      text: string;
      senderId: string;
      senderName: string;
      senderRole: string;
      mood?: string;
      replyTo?: Message['replyTo'];
      imageUrl?: string;
      voiceUrl?: string;
      voiceDuration?: number;
    }) => {
      // Haptic Feedback
      if (typeof window !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }

      // Sound Effect
      try {
         const audio = new Audio('/sounds/send.mp3');
         audio.volume = 0.5;
         audio.play().catch(() => {});
      } catch (e) {}

      // Optimistic Update
      const tempId = `temp_${Date.now()}`;
      const tempMessage: Message = {
        id: tempId,
        ...data,
        createdAt: new Date().toISOString(),
        status: 'sending'
      };

      setMessages(prev => [...prev, tempMessage]);

      try {
        const { collection, addDoc } = await import('firebase/firestore');
        const colPath = chatType === 'shared' ? 'shared_chats' : `private_chats/${uid}/messages`;
        
        const messageData = {
          text: data.text,
          senderId: data.senderId,
          senderName: data.senderName,
          senderRole: data.senderRole,
          createdAt: new Date().toISOString(),
          isEdited: false,
          isDeleted: false,
          isPinned: false,
          reactions: {},
          ...(data.mood && { mood: data.mood }),
          ...(data.replyTo && { replyTo: data.replyTo }),
          ...(data.imageUrl && { imageUrl: data.imageUrl }),
          ...(data.voiceUrl && { voiceUrl: data.voiceUrl }),
          ...(data.voiceDuration && { voiceDuration: data.voiceDuration }),
        };

        const docRef = await addDoc(collection(db, colPath), messageData);
        
        // Update local state
        setMessages(prev => prev.map(msg => 
          msg.id === tempId ? { ...msg, id: docRef.id, status: 'sent' } : msg
        ));
        
        return { id: docRef.id, ...messageData };
      } catch (error: any) {
        toast.error(error.message || 'مشکلی پیش آمد.');
        // Set error status
        setMessages(prev => prev.map(msg => 
          msg.id === tempId ? { ...msg, status: 'error' } : msg
        ));
        throw error;
      }
    },
    [uid, chatType]
  );

  // ===== EDIT MESSAGE =====
  const editMessage = useCallback(
    async (messageId: string, newText: string) => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const colPath = chatType === 'shared' ? 'shared_chats' : `private_chats/${uid}/messages`;
      await updateDoc(doc(db, colPath, messageId), {
        text: newText,
        isEdited: true
      });
    },
    [uid, chatType]
  );

  // ===== DELETE MESSAGE =====
  const deleteMessage = useCallback(
    async (messageId: string) => {
      const { doc, deleteDoc } = await import('firebase/firestore');
      const colPath = chatType === 'shared' ? 'shared_chats' : `private_chats/${uid}/messages`;
      await deleteDoc(doc(db, colPath, messageId));
    },
    [uid, chatType]
  );

  // ===== TOGGLE PIN =====
  const togglePin = useCallback(
    async (messageId: string, isPinned: boolean) => {
      const { doc, updateDoc } = await import('firebase/firestore');
      const colPath = chatType === 'shared' ? 'shared_chats' : `private_chats/${uid}/messages`;
      await updateDoc(doc(db, colPath, messageId), {
        isPinned: !isPinned
      });
    },
    [uid, chatType]
  );

  // ===== ADD REACTION =====
  const addReaction = useCallback(
    async (messageId: string, emoji: string, userId: string) => {
      const { doc, getDoc, updateDoc } = await import('firebase/firestore');
      const colPath = chatType === 'shared' ? 'shared_chats' : `private_chats/${uid}/messages`;
      const msgRef = doc(db, colPath, messageId);
      const snapshot = await getDoc(msgRef);
      if (snapshot.exists()) {
        const data = snapshot.data();
        const reactions = data.reactions || {};
        const count = reactions[emoji] || 0;
        await updateDoc(msgRef, {
          [`reactions.${emoji}`]: count + 1
        });
      }
    },
    [uid, chatType]
  );

  // ===== SEARCH =====
  const searchMessages = useCallback(
    async (queryText: string): Promise<Message[]> => {
      const { collection, getDocs } = await import('firebase/firestore');
      const colPath = chatType === 'shared' ? 'shared_chats' : `private_chats/${uid}/messages`;
      // Firestore doesn't support full-text search natively, fallback to fetch everything and filter (only for demo sizes)
      const snapshot = await getDocs(collection(db, colPath));
      const results: Message[] = [];
      snapshot.forEach(d => {
        const data = d.data() as Message;
        if (data.text?.toLowerCase().includes(queryText.toLowerCase())) {
          results.push({ id: d.id, ...data });
        }
      });
      return results;
    },
    [uid, chatType]
  );

  // ===== CLEAR CHAT =====
  const clearChat = useCallback(async () => {
    // Basic implementation: fetch all and delete manually or via a batch.
    // In production, batch delete is better or done on backend.
    const { collection, getDocs, writeBatch } = await import('firebase/firestore');
    const colPath = chatType === 'shared' ? 'shared_chats' : `private_chats/${uid}/messages`;
    const snapshot = await getDocs(collection(db, colPath));
    const batch = writeBatch(db);
    snapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    setMessages([]);
  }, [uid, chatType]);

  return {
    messages,
    loading,
    hasMore,
    pinnedMessages,
    loadMore,
    sendMessage,
    editMessage,
    deleteMessage,
    togglePin,
    addReaction,
    searchMessages,
    clearChat,
  };
}
