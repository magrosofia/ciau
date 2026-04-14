import { useEffect, useState } from 'react';
import { API } from '../api';

export default function ProfilePage() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    API.history().then(setHistory).catch(() => setHistory([]));
  }, []);

  return (
    <main className="container">
      <h2>Completed Games History</h2>
      {history.length === 0 && <p>No completed games yet.</p>}
      {history.map((g) => (
        <section key={g.id} className="panel">
          <h3>Game #{g.id} — {g.outcome} — Cards collected: {g.total_collected}</h3>
          <p>Started: {g.started_at}</p>
          <ul>
            {g.cards.map((c, idx) => (
              <li key={idx}>
                {c.title} — {c.won ? 'won' : 'lost'} {c.is_initial ? '(initial card)' : `(round ${c.round_number})`}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
