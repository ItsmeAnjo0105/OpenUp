import { useEffect, useRef, useState } from 'react';
import { API_URL } from '../config';

function DailyInsights({ userId }) {
  const [cards, setCards] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!userId) return;
    fetch(`${API_URL}/insights/user/${userId}`)
      .then((res) => res.json())
      .then((data) => setCards(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [userId]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = el.firstChild?.offsetWidth || 1;
    const gap = 12; // matches gap-3
    const index = Math.round(el.scrollLeft / (cardWidth + gap));
    setActiveIndex(index);
  };

  const scrollToIndex = (index) => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = el.firstChild?.offsetWidth || 1;
    const gap = 12;
    el.scrollTo({ left: index * (cardWidth + gap), behavior: 'smooth' });
  };

  if (cards.length === 0) return null;

  return (
    <div>
      <p className="font-medium mb-3">Daily Insights</p>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-3 overflow-x-auto pb-2"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {cards.map((card, i) => (
          <div
            key={i}
            className="shrink-0 rounded-2xl p-4"
            style={{
              width: '230px',
              backgroundColor: `${card.accentColor}1A`,
              scrollSnapAlign: 'start',
            }}
          >
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center text-base mb-3"
              style={{ backgroundColor: `${card.accentColor}33` }}
            >
              {card.icon}
            </span>
            <p
              className="uppercase font-semibold tracking-wide mb-1"
              style={{ fontSize: '11px', color: card.accentColor }}
            >
              {card.label}
            </p>
            <p className="font-semibold text-brand-ink" style={{ fontSize: '14px' }}>
              {card.title}
            </p>
            <p className="text-brand-ink/60 mt-1" style={{ fontSize: '12px' }}>
              {card.subtext}
            </p>
          </div>
        ))}
      </div>

      {cards.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {cards.map((card, i) => (
            <button
              key={i}
              onClick={() => scrollToIndex(i)}
              aria-label={`Go to insight ${i + 1}`}
              className="w-2 h-2 rounded-full transition-colors"
              style={{
                backgroundColor: i === activeIndex ? card.accentColor : 'transparent',
                border: i === activeIndex ? 'none' : '1px solid rgba(28,36,32,0.2)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default DailyInsights;
