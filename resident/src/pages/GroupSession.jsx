import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { API_URL } from '../config';

function GroupSession() {
  const { groupSessionId } = useParams();
  const jitsiContainerRef = useRef(null);
  const user = JSON.parse(localStorage.getItem('openup_user') || 'null');

  useEffect(() => {
    let api;
    let disposed = false;

    fetch(`${API_URL}/group-session-token/${groupSessionId}?name=${user.name}&role=${user.role}`)
      .then((res) => res.json())
      .then(({ token, room }) => {
        if (disposed) return; // effect was cleaned up before the fetch resolved

        api = new window.JitsiMeetExternalAPI('8x8.vc', {
          roomName: room,
          jwt: token,
          parentNode: jitsiContainerRef.current,
          width: '100%',
          height: 500,
          configOverwrite: {
            disableVideo: true,
            startWithVideoMuted: true,
            startWithAudioMuted: false,
            startAudioOnly: true,
            prejoinPageEnabled: false,
          },
          interfaceConfigOverwrite: {
            TOOLBAR_BUTTONS: ['microphone', 'hangup', 'chat'],
          },
        });
      });

    return () => {
      disposed = true;
      if (api) api.dispose();
    };
  }, [groupSessionId, user]);

  if (!user) return null;

  return (
    <Layout>
      <h2 className="font-display text-2xl font-semibold mb-4">Group Session</h2>
      <div ref={jitsiContainerRef} />
    </Layout>
  );
}

export default GroupSession;
