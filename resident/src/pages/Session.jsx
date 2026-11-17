import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import PsychologistLayout from '../components/PsychologistLayout';
import CounselingSession from '../CounselingSession';
import ChatPanel from '../components/ChatPanel';

function Session() {
  const { bookingId } = useParams();
  const user = JSON.parse(localStorage.getItem('openup_user') || 'null');

  if (!user) return null;

  const LayoutForRole = user.role === 'psychologist' ? PsychologistLayout : Layout;

  return (
    <LayoutForRole>
      <CounselingSession bookingId={bookingId} name={user.name} role={user.role} />
      <div className="max-w-xl mt-6">
        <p className="font-medium text-sm mb-2">Live chat</p>
        <ChatPanel bookingId={bookingId} myRole={user.role} />
      </div>
    </LayoutForRole>
  );
}

export default Session;
