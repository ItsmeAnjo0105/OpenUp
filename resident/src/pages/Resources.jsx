import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { API_URL } from '../config';

function Resources() {
  const [resources, setResources] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/resources`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setResources(data);
        else setError(data?.error || 'Could not load resources.');
      })
      .catch(() => setError('Could not load resources.'));
  }, []);

  const categories = useMemo(
    () => ['All', ...new Set(resources.map((r) => r.category).filter(Boolean))],
    [resources]
  );

  const visibleResources = useMemo(() => resources.filter((r) => {
    if (category !== 'All' && r.category !== category) return false;
    if (search) {
      const needle = search.toLowerCase();
      const haystack = `${r.title} ${r.description || ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  }), [resources, search, category]);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="font-display text-2xl font-semibold mb-1">Wellness Resources</h1>
        <p className="text-brand-ink/60 text-sm mb-6">Guides and articles you can read or download anytime.</p>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search resources..."
          className="w-full border border-brand-ink/15 rounded-lg px-4 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />

        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`text-xs font-medium px-3.5 py-1.5 rounded-full ${
                  category === c ? 'bg-brand-primary text-white' : 'border border-brand-ink/15 text-brand-ink/70'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {visibleResources.length === 0 ? (
          <p className="text-sm text-brand-ink/50">No resources found.</p>
        ) : (
          <div className="space-y-3">
            {visibleResources.map((r) => (
              <div key={r.resource_id} className="bg-brand-surface rounded-2xl shadow-sm p-5 flex items-start justify-between gap-4">
                <div>
                  {r.category && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary uppercase tracking-wide">
                      {r.category}
                    </span>
                  )}
                  <p className="font-medium mt-1">{r.title}</p>
                  {r.description && <p className="text-sm text-brand-ink/60 mt-1">{r.description}</p>}
                </div>
                <a
                  href={r.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white"
                >
                  Open / Download
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

export default Resources;
