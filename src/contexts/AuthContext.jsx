import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { DEFAULT_SETTINGS, ROLES, can as canAccess } from '../lib/constants';
import { isPreview, previewDb } from '../lib/preview';

const AuthContext = createContext(null);

const PREVIEW_MSG = 'Preview mode — connect Firebase to sign in and save data.';

/** Sample signed-in user for preview mode. The role can be switched to see each department's view. */
function PreviewAuthProvider({ children }) {
  const [role, setRole] = useState(() => {
    try { return localStorage.getItem('previewRole') || 'admin'; } catch { return 'admin'; }
  });
  const value = useMemo(() => {
    // Roles without a sample person get a stand-in so every role can be previewed.
    const profile = previewDb.users.find((u) => u.role === role && u.active)
      || { ...previewDb.users[0], id: `u-${role}`, name: `Sample ${ROLES[role]?.label || role}`, role, department: '' };
    const reject = () => Promise.reject(new Error(PREVIEW_MSG));
    return {
      preview: true,
      user: { uid: profile.id, email: profile.email },
      profile,
      role: profile.role,
      settings: DEFAULT_SETTINGS,
      loading: false,
      isAdmin: profile.role === 'admin',
      can: (area) => canAccess(profile.role, area),
      setPreviewRole: (r) => {
        try { localStorage.setItem('previewRole', r); } catch { /* ignore */ }
        setRole(r);
      },
      login: reject, logout: () => Promise.resolve(), resetPassword: reject, register: reject,
    };
  }, [role]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }) {
  if (isPreview) return <PreviewAuthProvider>{children}</PreviewAuthProvider>;
  return <FirebaseAuthProvider>{children}</FirebaseAuthProvider>;
}

function FirebaseAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Firebase auth state
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
      }
    });
  }, []);

  // Live user profile (role changes apply instantly)
  useEffect(() => {
    if (!user) return undefined;
    setLoading(true);
    return onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [user]);

  // Live app settings (only readable once the user is active)
  useEffect(() => {
    if (!profile?.active) return undefined;
    return onSnapshot(
      doc(db, 'settings', 'app'),
      (snap) => setSettings({ ...DEFAULT_SETTINGS, ...(snap.exists() ? snap.data() : {}) }),
      () => {},
    );
  }, [profile?.active]);

  const value = useMemo(() => {
    const role = profile?.active ? profile.role : 'pending';
    return {
      user,
      profile,
      role,
      settings,
      loading,
      isAdmin: role === 'admin',
      can: (area) => canAccess(role, area),

      login: (email, password) => signInWithEmailAndPassword(auth, email, password),
      logout: () => signOut(auth),
      resetPassword: (email) => sendPasswordResetEmail(auth, email),

      async register({ name, email, password }) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });

        // The first account ever created becomes the admin.
        const bootstrapRef = doc(db, 'meta', 'bootstrap');
        const bootstrap = await getDoc(bootstrapRef);
        const isFirst = !bootstrap.exists();

        const batch = writeBatch(db);
        batch.set(doc(db, 'users', cred.user.uid), {
          name,
          email: email.toLowerCase(),
          role: isFirst ? 'admin' : 'pending',
          active: isFirst,
          department: isFirst ? 'Management' : '',
          createdAt: serverTimestamp(),
        });
        if (isFirst) batch.set(bootstrapRef, { adminUid: cred.user.uid, createdAt: serverTimestamp() });
        await batch.commit();
        return { isFirst };
      },
    };
  }, [user, profile, settings, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
