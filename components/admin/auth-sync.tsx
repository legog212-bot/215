'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';

interface AdminAuthContextType {
  isReady: boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType>({ isReady: false });

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}

export function AdminAuthSync({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [isReady, setIsReady] = useState(pathname === '/admin/login');

  useEffect(() => {
    if (pathname === '/admin/login') {
      setIsReady(true);
      return;
    }

    let cancelled = false;

    async function ensureSession() {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          if (!cancelled) setIsReady(true);
          return;
        }

        // Fetch fresh authenticated session from server
        const res = await fetch('/api/admin/session');
        if (res.ok) {
          const body = await res.json();
          if (body.session && !cancelled) {
            await supabase.auth.setSession(body.session);
          }
        }
      } catch (err) {
        console.error('[AdminAuthSync error]:', err);
      } finally {
        if (!cancelled) setIsReady(true);
      }
    }

    ensureSession();

    return () => {
      cancelled = true;
    };
  }, [pathname, supabase]);

  return (
    <AdminAuthContext.Provider value={{ isReady }}>
      {children}
    </AdminAuthContext.Provider>
  );
}
