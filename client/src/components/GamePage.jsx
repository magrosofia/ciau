import { useEffect, useMemo, useState } from 'react';
import { API } from '../api';

const TURN_SECONDS = 30;

export default function GamePage({ user }) {
  const [game, setGame] = useState(null);
  const [current, setCurrent] = useState(null);
  const [message, setMessage] = useState('');
  const [seconds, setSeconds] = useState(TURN_SECONDS);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    async function init() {
      const g = user ? await API.startGame() : await API.startDemo();
      setGame(g);
      setCurrent(null);
      setMessage('Click "Start round" when ready.');
      setSummary(null);
    }
    init().catch((e) => setMessage(e.message));
  }, [user]);

  useEffect(() => {
    if (!current) return undefined;
    if (seconds <= 0) {
      submitGuess(null, true);
      return undefined;
    }
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [current, seconds]);

  async function startRound() {
    if (!game) return;
    const round = await API.nextRound(game.gameId);
    setCurrent(round);
    setSeconds(TURN_SECONDS);
    setMessage('Choose insertion position before timer ends.');
  }

  async function submitGuess(slot, timedOut = false) {
    if (!game) return;
    const result = await API.guess(game.gameId, slot, timedOut);
    setGame((g) => ({ ...g, cards: result.cards, lostAttempts: result.lostAttempts }));
    setCurrent(null);
    if (result.won) setMessage('Correct! Card collected.');
    else setMessage(timedOut ? 'Time expired! Round lost.' : 'Wrong position. Round lost.');

    if (result.gameOver) {
      const s = await API.summary(game.gameId);
      setSummary(s);
      setMessage(result.outcome === 'WIN' ? 'Game won!' : 'Game lost!');
    }
  }

  const ordered = useMemo(() => [...(game?.cards ?? [])].sort((a, b) => a.bad_luck_index - b.bad_luck_index), [game]);

  return (
    <main className="container">
      <h2>{user ? 'Full Game' : 'Demo Game'}</h2>
      <p>{message}</p>
      {game && <p>Cards: {ordered.length} | Mistakes: {game.lostAttempts}/3</p>}
      {!current && !summary && <button onClick={startRound}>Start round</button>}

      {current && (
        <section className="panel">
          <h3>New horrible situation (Round {current.round})</h3>
          <p><strong>{current.title}</strong></p>
          <img src={current.image_url} alt={current.title} />
          <p>Time left: {seconds}s</p>
          <div className="slots">
            {Array.from({ length: ordered.length + 1 }).map((_, i) => (
              <button key={i} onClick={() => submitGuess(i)}>Place at position {i + 1}</button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3>Your cards</h3>
        <div className="grid">
          {ordered.map((c) => (
            <article className="panel" key={c.id}>
              <h4>{c.title}</h4>
              <img src={c.image_url} alt={c.title} />
              <p>Bad luck index: {c.bad_luck_index}</p>
            </article>
          ))}
        </div>
      </section>

      {summary && (
        <section>
          <h3>Game summary: {summary.outcome}</h3>
          <p>Collected cards: {summary.total_collected}</p>
        </section>
      )}
    </main>
  );
}
