import { AdminLangProvider } from '@/lib/admin-i18n';
import { AdminNav } from '@/components/admin/nav';
import { AdminAuthSync } from '@/components/admin/auth-sync';
import { Toaster } from '@/components/ui/sonner';
import '../../globals.css';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ka" suppressHydrationWarning>
      <head>
        <title>№215 Admin</title>
        {/* sync html lang from localStorage before paint to avoid flash */}
        <script dangerouslySetInnerHTML={{ __html: `try{var l=localStorage.getItem('admin-lang');if(l)document.documentElement.lang=l}catch(e){}` }} />
      </head>
      <body>
        <AdminLangProvider>
          <AdminAuthSync>
            <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
              <AdminNav />
              <main className="flex-1 px-4 pb-24">{children}</main>
            </div>
            <Toaster />
          </AdminAuthSync>
        </AdminLangProvider>
      </body>
    </html>
  );
}

