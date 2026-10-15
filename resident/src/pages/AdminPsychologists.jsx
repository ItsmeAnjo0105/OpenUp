import { IconStethoscope } from '@tabler/icons-react';
import AdminLayout from '../components/AdminLayout';
import AdminUserList from '../components/AdminUserList';

function AdminPsychologists() {
  return (
    <AdminLayout>
      <AdminUserList
        title="Psychologists"
        subtitle="Every psychologist account on the platform. For license review, see Verification."
        icon={<IconStethoscope size={22} className="text-brand-primary" />}
        fixedRole="psychologist"
      />
    </AdminLayout>
  );
}

export default AdminPsychologists;
