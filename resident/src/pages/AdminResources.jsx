import AdminLayout from '../components/AdminLayout';
import AdminTopBar from '../components/AdminTopBar';
import ComingSoon from '../components/ComingSoon';

function AdminResources() {
  return (
    <AdminLayout>
      <div className="flex justify-end mb-4">
        <AdminTopBar />
      </div>
      <ComingSoon
        title="Resources"
        subtitle="Residents' Wellness Resources page is real (Supabase Storage-backed, verified working), but there's no admin UI yet to add/edit/delete/publish new ones -- content can currently only be seeded by writing directly to Supabase."
      />
    </AdminLayout>
  );
}

export default AdminResources;
