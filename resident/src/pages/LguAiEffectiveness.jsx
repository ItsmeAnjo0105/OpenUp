import LguLayout from '../components/LguLayout';
import LguTopBar from '../components/LguTopBar';
import ComingSoon from '../components/ComingSoon';

function LguAiEffectiveness() {
  return (
    <LguLayout>
      <div className="flex justify-end mb-4">
        <LguTopBar />
      </div>
      <ComingSoon
        title="AI Effectiveness Tracker"
        subtitle="There's no rating or outcome-tracking system for the AI Crisis Companion yet, so there's nothing real to show here."
      />
    </LguLayout>
  );
}

export default LguAiEffectiveness;
