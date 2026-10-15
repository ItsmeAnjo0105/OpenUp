import { useEffect, useState } from 'react';
import { IconTool } from '@tabler/icons-react';
import { API_URL } from '../config';

// Real, not decorative: reflects Platform_Setting.maintenance_mode, which an
// admin toggles from Settings > Manage Configurations. A thin banner, not a
// full block screen -- the admin still needs to be able to use the app to
// turn it back off.
function MaintenanceBanner() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/platform-status`)
      .then((res) => res.json())
      .then((data) => setStatus(data))
      .catch(() => {});
  }, []);

  if (!status?.maintenance_mode) return null;

  return (
    <div className="bg-amber-500 text-white text-xs font-medium px-4 py-2 flex items-center justify-center gap-2 text-center">
      <IconTool size={14} /> {status.platform_name} is undergoing maintenance. Some features may be unavailable.
    </div>
  );
}

export default MaintenanceBanner;
