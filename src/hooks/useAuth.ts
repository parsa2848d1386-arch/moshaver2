'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { UserProfile, UserSettings } from '@/types';

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    let active = true;

    console.log('[useAuth] Registering onAuthStateChanged listener...');
    const unsubscribeFn = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('[useAuth] onAuthStateChanged fired. User:', firebaseUser ? `${firebaseUser.uid} (${firebaseUser.email})` : 'null');
      if (firebaseUser) {
        setUser(firebaseUser);
        setError('');
        
        try {
          console.log('[useAuth] Fetching profile from Firestore...');
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            const profileData = userDoc.data() as UserProfile;
            console.log('[useAuth] Loaded profile:', profileData.displayName);
            if (active) setProfile(profileData);
          } else {
            console.warn('[useAuth] Profile not found in Firestore. Redirecting to login...');
            router.push('/login');
          }
        } catch (err: any) {
          console.error('[useAuth] Profile load error:', err);
          router.push('/login');
        }
      } else {
        console.log('[useAuth] No user active. Redirecting to /login...');
        router.push('/login');
      }
      if (active) setLoading(false);
    }, (authError) => {
      console.error('[useAuth] Firebase Auth Exception:', authError);
      if (active) {
        setError('FIREBASE_ERROR');
        setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribeFn();
    };
  }, [router]);

  const updateProfile = useCallback(
    (updates: Partial<UserProfile>) => {
      setProfile((prev) => (prev ? { ...prev, ...updates } : null));
    },
    []
  );

  const saveSettings = useCallback(
    async (
      editName: string,
      editAvatar: string,
      settings: UserSettings
    ) => {
      if (!user || !profile) throw new Error('کاربر وارد نشده');
      
      const userDocRef = doc(db, 'users', user.uid);
      const updateData = {
        displayName: editName.trim() || profile.displayName,
        avatar: editAvatar,
        settings,
        updatedAt: new Date().toISOString()
      };
      
      await updateDoc(userDocRef, updateData);
      
      updateProfile({
        displayName: editName.trim() || profile.displayName,
        avatar: editAvatar,
        settings,
      });
    },
    [user, profile, updateProfile]
  );

  const logout = useCallback(async () => {
    await signOut(auth);
    router.push('/login');
  }, [router]);

  return { user, profile, loading, error, updateProfile, saveSettings, logout };
}
