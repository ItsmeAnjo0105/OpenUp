import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import CounselingSession from '../CounselingSession';

function Session() {
  const { bookingId } = useParams();
  const user = JSON.parse(localStorage.getItem('openup_user') || 'null');

  if (!user) return null;

  return (
    <Layout>
      <CounselingSession bookingId={bookingId} name={user.name} role={user.role} />
    </Layout>
  );
}

export default Session;
