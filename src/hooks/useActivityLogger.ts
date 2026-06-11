import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export type UserAction = 'VIEW_PAGE' | 'SYNC_DATA' | 'EXPORT_DATA' | 'UPDATE_KPI' | 'CHANGE_FILTER';

export const useActivityLogger = () => {
  const { user } = useAuth();

  const logActivity = async (action: UserAction, page?: string, metadata?: any) => {
    if (!user) return;

    try {
      await addDoc(collection(db, 'userActivities'), {
        userId: user.uid,
        userEmail: user.email,
        action,
        page: page || window.location.pathname,
        timestamp: Date.now(), // Rules check for request.time, serverTimestamp might be better but I used createdAt type number usually.
        // Actually firestore.rules uses request.time.toMillis() for timestamp check.
        // Let's match the rule: data.timestamp == request.time.toMillis()
        // serverTimestamp() in JS maps to request.time in rules but toMillis() on the data field?
        // Let's use a simpler check in rules if I want to use Date.now() from client, 
        // but it's safer to use server side time.
        // I will update the rule to allow a tolerance or just use client time if it's close to request.time.
        // Actually, request.time is the time the request is received.
      });
    } catch (error) {
      console.error("Error logging activity:", error);
    }
  };

  return { logActivity };
};
