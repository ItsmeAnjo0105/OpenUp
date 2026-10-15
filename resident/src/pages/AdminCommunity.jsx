import AdminLayout from '../components/AdminLayout';
import AdminTopBar from '../components/AdminTopBar';
import ComingSoon from '../components/ComingSoon';

function AdminCommunity() {
  return (
    <AdminLayout>
      <div className="flex justify-end mb-4">
        <AdminTopBar />
      </div>
      <ComingSoon
        title="Community"
        subtitle="Testimonial moderation (review/keep/remove flagged posts) isn't built yet -- there's no flagging mechanism on Community Testimonials to review."
      />
    </AdminLayout>
  );
}

export default AdminCommunity;
