import Sidebar from './Sidebar';

function Layout({ children }) {
  return (
    <div className="flex min-h-screen bg-brand-bg">
      <Sidebar />
      <main className="flex-1 px-8 py-10 overflow-y-auto">{children}</main>
    </div>
  );
}

export default Layout;
