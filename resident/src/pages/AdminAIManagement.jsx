import { Link } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import AdminTopBar from '../components/AdminTopBar';
import ComingSoon from '../components/ComingSoon';

function AdminAIManagement() {
  return (
    <AdminLayout>
      <div className="flex justify-end mb-4">
        <AdminTopBar />
      </div>
      <ComingSoon
        title="AI Management"
        subtitle="Platform-wide escalation-rule configuration and emergency-contact management aren't built yet. A real, barangay-scoped AI Effectiveness Tracker (detection rate, escalation outcomes, ratings) does exist for the LGU role -- see any barangay's dashboard."
      />
      <p className="text-xs text-brand-ink/40 mt-4">
        No LGU account of your own? <Link to="/admin/lgu-accounts" className="text-brand-primary underline">Onboard one</Link> to see it live.
      </p>
    </AdminLayout>
  );
}

export default AdminAIManagement;
