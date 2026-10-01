import LguLayout from '../components/LguLayout';
import LguTopBar from '../components/LguTopBar';
import ComingSoon from '../components/ComingSoon';

function LguDataGovernance() {
  return (
    <LguLayout>
      <div className="flex justify-end mb-4">
        <LguTopBar />
      </div>
      <ComingSoon
        title="Data Governance & Consent"
        subtitle="There's no consent-record data model in the app yet -- residents' consent at signup/assessment isn't logged anywhere queryable, so there's nothing real to show here."
      />
    </LguLayout>
  );
}

export default LguDataGovernance;
