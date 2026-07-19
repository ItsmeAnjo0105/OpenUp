import { useState } from 'react';
import Sidebar from './Sidebar';

function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-brand-bg">
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="flex-1 px-8 py-10 overflow-y-auto">
        <button
          onClick={() => setSidebarOpen(true)}
          className="md:hidden mb-6 text-2xl text-brand-ink/70"
        >
          ☰
        </button>
        {children}
      </main>
    </div>
  );
}

export default Layout;
