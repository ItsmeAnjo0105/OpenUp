import { useEffect, useRef } from 'react';
import { API_URL } from './config';

function CounselingSession({ bookingId, name, role }) {
  const jitsiContainerRef = useRef(null);

  useEffect(() => {
    let api;
    let disposed = false;

    fetch(`${API_URL}/jitsi-token/${bookingId}?name=${name}&role=${role}`)
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
  }, [bookingId, name, role]);

  return (
    <div>
      <h2>Counseling Session — Booking #{bookingId}</h2>
      <div ref={jitsiContainerRef} />
    </div>
  );
}

export default CounselingSession;
