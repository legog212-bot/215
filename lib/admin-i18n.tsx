'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import ka from '../messages/admin-ka.json';
import ru from '../messages/admin-ru.json';

export type AdminLocale = 'ka' | 'ru';

const dicts: Record<AdminLocale, typeof ru> = { ka, ru };

const AdminLangContext = createContext<{
  lang: AdminLocale;
  setLang: (l: AdminLocale) => void;
}>({ lang: 'ka', setLang: () => {} });

export function AdminLangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AdminLocale>('ka');

  useEffect(() => {
    const saved = localStorage.getItem('admin-lang');
    if (saved === 'ka' || saved === 'ru') setLangState(saved);
  }, []);

  const setLang = (l: AdminLocale) => {
    setLangState(l);
    localStorage.setItem('admin-lang', l);
  };

  return (
    <AdminLangContext.Provider value={{ lang, setLang }}>
      {children}
    </AdminLangContext.Provider>
  );
}

/** Dot-path lookup: t('nav.calendar') */
export function useAdminT() {
  const { lang, setLang } = useContext(AdminLangContext);
  const dict = dicts[lang] as Record<string, unknown>;

  const t = (path: string): string => {
    const val = path
      .split('.')
      .reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], dict);
    return typeof val === 'string' ? val : path;
  };

  return { t, lang, setLang };
}
