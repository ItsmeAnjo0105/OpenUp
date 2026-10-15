import AdminLayout from '../components/AdminLayout';
import AdminTopBar from '../components/AdminTopBar';
import ComingSoon from '../components/ComingSoon';

function AdminSettings() {
  return (
    <AdminLayout>
      <div className="flex justify-end mb-4">
        <AdminTopBar />
      </div>
      <ComingSoon
        title="Settings"
        subtitle="Platform configuration, role & permission management, and backup/maintenance controls aren't built yet."
      />
    </AdminLayout>
  );
}

export default AdminSettings;
