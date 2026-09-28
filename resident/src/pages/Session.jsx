import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import PsychologistLayout from '../components/PsychologistLayout';
import CounselingSession from '../CounselingSession';

function Session() {
  const { bookingId } = useParams();
  const user = JSON.parse(localStorage.getItem('openup_user') || 'null');

  if (!user) return null;

  const LayoutForRole = user.role === 'psychologist' ? PsychologistLayout : Layout;

  return (
    <LayoutForRole>
      <CounselingSession bookingId={bookingId} name={user.name} role={user.role} />
    </LayoutForRole>
  );
}

export default Session;
