import { useEffect, useState } from 'react';
import { IconRobot, IconActivity, IconArrowRight, IconStar } from '@tabler/icons-react';
import LguLayout from '../components/LguLayout';
import LguTopBar from '../components/LguTopBar';
import { API_URL, authHeader } from '../config';

function LguAiEffectiveness() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/lgu/me/ai-effectiveness`, { headers: authHeader() })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => (ok ? setData(body) : setError(body?.error || 'Could not load AI effectiveness data.')))
      .catch(() => setError('Could not reach the server.'));
  }, []);

  const maxStarCount = data ? Math.max(1, ...data.ratings.distribution.map((d) => d.count)) : 1;

  return (
    <LguLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconRobot size={22} className="text-brand-primary" /> AI Effectiveness Tracker
          </h1>
          <p className="text-brand-ink/60 text-sm">
            Real activity from residents of your barangay -- not a validated accuracy score.
          </p>
        </div>
        <LguTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      {data && (
        <>
          <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mt-6 mb-5">
            <h2 className="font-display text-base font-semibold flex items-center gap-1.5 mb-1">
              <IconActivity size={16} className="text-brand-primary" /> Detection rate
            </h2>
            <p className="text-xs text-brand-ink/50 mb-4">
              Share of Voice Journal entries and AI Crisis Companion messages that tripped the
              crisis-language check. This is a flag rate, not accuracy -- nothing in the app
              confirms afterward whether a flag was a real crisis or a false alarm, so a true
              accuracy score can't honestly be claimed.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-brand-ink/50">Overall flag rate</p>
                <p className="text-2xl font-semibold mt-0.5">
                  {data.detection.flag_rate != null ? `${data.detection.flag_rate}%` : 'No data'}
                </p>
                <p className="text-[11px] text-brand-ink/40">{data.detection.total_flagged} of {data.detection.total_checked} checked</p>
              </div>
              <div>
                <p className="text-xs text-brand-ink/50">Voice Journal</p>
                <p className="text-2xl font-semibold mt-0.5">{data.detection.voice_journal.flagged}</p>
                <p className="text-[11px] text-brand-ink/40">flagged of {data.detection.voice_journal.total} entries</p>
              </div>
              <div>
                <p className="text-xs text-brand-ink/50">Crisis Companion chat</p>
                <p className="text-2xl font-semibold mt-0.5">{data.detection.companion_chat.flagged}</p>
                <p className="text-[11px] text-brand-ink/40">flagged of {data.detection.companion_chat.total} messages</p>
              </div>
            </div>
          </div>

          <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mb-5">
            <h2 className="font-display text-base font-semibold flex items-center gap-1.5 mb-1">
              <IconArrowRight size={16} className="text-brand-primary" /> Escalation outcomes
            </h2>
            <p className="text-xs text-brand-ink/50 mb-4">
              What happened after a flagged entry or message tried to escalate -- matched with a
              psychologist immediately, or queued because nobody was available.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-xs text-brand-ink/50">Total escalations</p>
                <p className="text-2xl font-semibold mt-0.5">{data.escalations.total}</p>
              </div>
              <div>
                <p className="text-xs text-brand-ink/50">Matched immediately</p>
                <p className="text-2xl font-semibold mt-0.5">{data.escalations.matched}</p>
              </div>
              <div>
                <p className="text-xs text-brand-ink/50">Queued (nobody free)</p>
                <p className="text-2xl font-semibold mt-0.5">{data.escalations.queued}</p>
              </div>
            </div>
            {data.escalations.matched > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.escalations.matched_by_status).map(([status, count]) => (
                  count > 0 && (
                    <span key={status} className="text-xs font-medium px-2.5 py-1 rounded-full bg-brand-ink/5 text-brand-ink/60 capitalize">
                      {count} {status}
                    </span>
                  )
                ))}
              </div>
            )}
          </div>

          <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
            <h2 className="font-display text-base font-semibold flex items-center gap-1.5 mb-1">
              <IconStar size={16} className="text-brand-primary" /> User ratings
            </h2>
            <p className="text-xs text-brand-ink/50 mb-4">
              Residents rate the AI Crisis Companion directly in the chat after exchanging a few messages.
            </p>
            {data.ratings.count === 0 ? (
              <p className="text-sm text-brand-ink/40">No ratings submitted yet.</p>
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-4">
                  <p className="text-3xl font-semibold">{data.ratings.average}</p>
                  <p className="text-sm text-brand-ink/50">/ 5 from {data.ratings.count} rating{data.ratings.count === 1 ? '' : 's'}</p>
                </div>
                <div className="space-y-1.5">
                  {[...data.ratings.distribution].reverse().map((d) => (
                    <div key={d.star} className="flex items-center gap-2">
                      <span className="text-xs text-brand-ink/50 w-10 shrink-0">{d.star} star</span>
                      <div className="flex-1 h-2 bg-brand-ink/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-primary rounded-full"
                          style={{ width: `${(d.count / maxStarCount) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-brand-ink/40 w-6 text-right shrink-0">{d.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </LguLayout>
  );
}

export default LguAiEffectiveness;
