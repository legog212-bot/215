import { AdminLangProvider } from '@/lib/admin-i18n';
import { AdminNav } from '@/components/admin/nav';
import { Toaster } from '@/components/ui/sonner';
import '../../globals.css';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ka">
      <body>
        <AdminLangProvider>
          <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
            <AdminNav />
            <main className="flex-1 px-4 pb-24">{children}</main>
          </div>
          <Toaster />
        </AdminLangProvider>
      </body>
    </html>
  );
}
