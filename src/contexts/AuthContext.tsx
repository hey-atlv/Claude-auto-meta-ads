import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';

// Only this email is auto-approved as admin on first login. Everyone else
// starts as 'pending' and must be approved by an admin in Quản lý Truy cập
// before they can view any report page (see ProtectedRoute in App.tsx).
const ROOT_ADMIN_EMAIL = 'lvahust@gmail.com';

interface AuthContextType {
  user: User | null;
  role: 'admin' | 'user' | null;
  status: 'pending' | 'approved' | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  status: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);


export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'user' | null>(null);
  const [status, setStatus] = useState<'pending' | 'approved' | null>(null);
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
          
          const email = (currentUser.email || '').toLowerCase();
          const isRootAdmin = email === ROOT_ADMIN_EMAIL;

          if (userDoc.exists()) {
            const data = userDoc.data();
            const currentRole = data.role;
            // Existing docs created before the status field existed default
            // to 'pending' — admin must explicitly approve them.
            const currentStatus = data.status === 'approved' ? 'approved' : 'pending';

            if (isRootAdmin && (currentRole !== 'admin' || currentStatus !== 'approved')) {
              // Force root admin to always be admin + approved
              await setDoc(userDocRef, { role: 'admin', status: 'approved' }, { merge: true });
              setRole('admin');
              setStatus('approved');
            } else {
              setRole(currentRole === 'admin' ? 'admin' : 'user');
              setStatus(currentStatus);
            }
          } else {
            // Auto-create user profile if it doesn't exist.
            // Default to 'pending' status — admin must approve in Quản lý
            // Truy cập before this account can view any report — UNLESS an
            // admin already invited this exact email via invitedEmails, in
            // which case it's approved on the spot.
            let newRole: 'admin' | 'user' = isRootAdmin ? 'admin' : 'user';
            let newStatus: 'pending' | 'approved' = isRootAdmin ? 'approved' : 'pending';
            if (!isRootAdmin && email) {
              try {
                const inviteDoc = await getDoc(doc(db, 'invitedEmails', email));
                if (inviteDoc.exists()) {
                  const invite = inviteDoc.data();
                  newRole = invite.role === 'admin' ? 'admin' : 'user';
                  newStatus = 'approved';
                }
              } catch (inviteError) {
                console.warn('Không thể kiểm tra lời mời truy cập:', inviteError);
              }
            }
            await setDoc(userDocRef, {
              uid: currentUser.uid,
              email: email || `${currentUser.uid}@no-email.com`,
              role: newRole,
              status: newStatus,
              createdAt: Date.now()
            });
            setRole(newRole);
            setStatus(newStatus);
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
          if (email === ROOT_ADMIN_EMAIL) {
            setRole('admin');
            setStatus('approved');
          } else {
            // Fail closed: an error fetching the access record must not
            // silently grant access to report pages.
            setRole('user');
            setStatus('pending');
          }
        }
      } else {
        setRole(null);
        setStatus(null);
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
    <AuthContext.Provider value={{ user, role, status, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
