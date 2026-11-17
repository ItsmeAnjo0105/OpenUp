import { IconUsers } from '@tabler/icons-react';
import AdminLayout from '../components/AdminLayout';
import AdminUserList from '../components/AdminUserList';

function AdminResidents() {
  return (
    <AdminLayout>
      <AdminUserList
        title="Residents"
        subtitle="Every resident account on the platform."
        icon={<IconUsers size={22} className="text-brand-primary" />}
        fixedRole="resident"
      />
    </AdminLayout>
  );
}

export default AdminResidents;
