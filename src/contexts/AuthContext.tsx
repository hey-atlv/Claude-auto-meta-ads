import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';

interface AuthContextType {
  user: User | null;
  role: 'admin' | 'user' | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);


export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'user' | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Explicitly set persistence to local to prevent unexpected logouts
    setPersistence(auth, browserLocalPersistence).catch(console.error);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Check role in Firestore
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const currentRole = userDoc.data().role;
            const email = (currentUser.email || '').toLowerCase();
            if (email === 'lvahust@gmail.com' && currentRole !== 'admin') {
              // Force update to admin if they are lvahust@gmail.com
              await setDoc(userDocRef, { role: 'admin' }, { merge: true });
              setRole('admin');
            } else {
              setRole(currentRole);
            }
          } else {
            // Auto-create user profile if it doesn't exist
            // Default to 'user' role, unless it's the specific admin email
            const email = (currentUser.email || `${currentUser.uid}@no-email.com`).toLowerCase();
            const newRole = email === 'lvahust@gmail.com' ? 'admin' : 'user';
            await setDoc(userDocRef, {
              uid: currentUser.uid,
              email: email,
              role: newRole,
              createdAt: Date.now()
            });
            setRole(newRole);
          }
        } catch (error: any) {
          const isOffline = error?.message?.includes('offline') || error?.code === 'unavailable';
          const isQuota = error?.code === 'resource-exhausted' || error?.message?.toLowerCase().includes('quota');
          
          if (isOffline) {
            console.warn("Đang ở chế độ offline. Sử dụng quyền mặc định.");
          } else if (isQuota) {
            console.warn("Quota đã hết khi lấy quyền người dùng. Tạm thời sử dụng quyền mặc định.");
          } else {
            console.error("Error fetching user role:", error);
          }

          const email = (currentUser.email || '').toLowerCase();
          if (email === 'lvahust@gmail.com') {
            setRole('admin');
          } else {
            setRole('user'); // Fallback
          }
        }
      } else {
        setRole(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Login failed:", error);
      if (error && error.code === 'auth/unauthorized-domain') {
        alert(
          "LỖI ĐĂNG NHẬP:\n" +
          "Tên miền này chưa được cấp phép trong Firebase.\n\n" +
          "Vui lòng vào Firebase Console -> Authentication -> Settings -> Authorized domains\n" +
          "Và thêm domain sau vào danh sách:\n" +
          window.location.hostname
        );
      } else {
        alert("Lỗi đăng nhập: " + (error.message || String(error)));
      }
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, role, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
