import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { getDb, initDb, verifyPassword } from './db.mjs';

const app = express();
const PORT = 3001;
const CLIENT_URL = 'http://localhost:5173';

const activeGames = new Map();

function sanitizeUser(user) {
  return { id: user.id, username: user.username, name: user.name };
}

app.use(morgan('dev'));
app.use(express.json());
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(
  session({
    secret: 'stuff-happens-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { sameSite: 'lax' }
  })
);
app.use(passport.authenticate('session'));

passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const db = await getDb();
      const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
      if (!user || !verifyPassword(password, user)) {
        return done(null, false, { message: 'Invalid credentials' });
      }
      return done(null, sanitizeUser(user));
    } catch (err) {
      return done(err);
    }
  })
);

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const db = await getDb();
    const user = await db.get('SELECT id, username, name FROM users WHERE id = ?', [id]);
    done(null, user ?? false);
  } catch (err) {
    done(err);
  }
});

function requireAuth(req, res, next) {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function evaluateGuess(cards, candidate, slot) {
  const ordered = [...cards].sort((a, b) => a.bad_luck_index - b.bad_luck_index);
  const left = slot === 0 ? -Infinity : ordered[slot - 1].bad_luck_index;
  const right = slot === ordered.length ? Infinity : ordered[slot].bad_luck_index;
  return candidate.bad_luck_index > left && candidate.bad_luck_index < right;
}

async function getCardPool(excludedIds) {
  const db = await getDb();
  const placeholders = excludedIds.length ? excludedIds.map(() => '?').join(',') : null;
  const query = placeholders
    ? `SELECT id, title, image_url, bad_luck_index FROM cards WHERE id NOT IN (${placeholders})`
    : 'SELECT id, title, image_url, bad_luck_index FROM cards';
  return db.all(query, excludedIds);
}

async function startGame(userId, isDemo = false) {
  const db = await getDb();
  const allCards = await db.all('SELECT id, title, image_url, bad_luck_index FROM cards');
  const initial = allCards.sort(() => Math.random() - 0.5).slice(0, 3);
  const gameRes = await db.run('INSERT INTO games(user_id, started_at, is_demo) VALUES (?, datetime("now"), ?)', [userId ?? null, isDemo ? 1 : 0]);

  for (const c of initial) {
    await db.run('INSERT INTO game_cards(game_id, card_id, round_number, won, is_initial) VALUES (?, ?, null, 1, 1)', [gameRes.lastID, c.id]);
  }

  const state = {
    id: gameRes.lastID,
    userId,
    isDemo,
    cards: initial,
    lostAttempts: 0,
    round: 0,
    discarded: new Set(initial.map((c) => c.id)),
    pendingCard: null
  };

  activeGames.set(gameRes.lastID, state);
  return state;
}

async function nextRound(gameId) {
  const game = activeGames.get(gameId);
  if (!game) return null;
  const pool = await getCardPool(Array.from(game.discarded));
  if (pool.length === 0) return null;
  const card = pickRandom(pool);
  game.pendingCard = card;
  game.discarded.add(card.id);
  game.round += 1;
  return { id: card.id, title: card.title, image_url: card.image_url, round: game.round };
}

async function finalizeGame(game, outcome) {
  const db = await getDb();
  await db.run('UPDATE games SET ended_at = datetime("now"), outcome = ?, total_collected = ? WHERE id = ?', [
    outcome,
    game.cards.length,
    game.id
  ]);
  activeGames.delete(game.id);
}

app.post('/api/sessions', passport.authenticate('local'), (req, res) => {
  res.json(req.user);
});

app.get('/api/sessions/current', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'No session' });
  res.json(req.user);
});

app.delete('/api/sessions/current', (req, res) => {
  req.logout(() => res.status(204).end());
});

app.post('/api/games', requireAuth, async (req, res) => {
  const game = await startGame(req.user.id, false);
  res.json({ gameId: game.id, cards: game.cards.sort((a, b) => a.bad_luck_index - b.bad_luck_index), lostAttempts: 0, target: 6 });
});

app.post('/api/demo-games', async (req, res) => {
  const game = await startGame(null, true);
  res.json({ gameId: game.id, cards: game.cards.sort((a, b) => a.bad_luck_index - b.bad_luck_index), lostAttempts: 0, target: 4 });
});

app.get('/api/games/:id/round', async (req, res) => {
  const game = activeGames.get(Number(req.params.id));
  if (!game) return res.status(404).json({ error: 'Game not found or completed' });
  if (!game.isDemo && (!req.isAuthenticated() || req.user.id !== game.userId)) return res.status(401).json({ error: 'Unauthorized' });
  if (game.pendingCard) return res.status(409).json({ error: 'Round already active' });

  const round = await nextRound(game.id);
  if (!round) return res.status(400).json({ error: 'No more cards available' });
  res.json(round);
});

app.post('/api/games/:id/guess', async (req, res) => {
  const { slot, timedOut = false } = req.body;
  const game = activeGames.get(Number(req.params.id));
  if (!game || !game.pendingCard) return res.status(404).json({ error: 'No active round' });
  if (!game.isDemo && (!req.isAuthenticated() || req.user.id !== game.userId)) return res.status(401).json({ error: 'Unauthorized' });

  const card = game.pendingCard;
  game.pendingCard = null;
  const won = !timedOut && Number.isInteger(slot) && evaluateGuess(game.cards, card, slot);

  const db = await getDb();
  await db.run('INSERT INTO game_cards(game_id, card_id, round_number, won, is_initial) VALUES (?, ?, ?, ?, 0)', [
    game.id,
    card.id,
    game.round,
    won ? 1 : 0
  ]);

  if (won) {
    game.cards.push(card);
    game.cards.sort((a, b) => a.bad_luck_index - b.bad_luck_index);
  } else {
    game.lostAttempts += 1;
  }

  const target = game.isDemo ? 4 : 6;
  const gameWon = game.cards.length >= target;
  const gameLost = game.isDemo ? game.round >= 1 && !won : game.lostAttempts >= 3;

  if (gameWon || gameLost) {
    await finalizeGame(game, gameWon ? 'WIN' : 'LOSS');
  }

  res.json({
    won,
    card: won ? card : null,
    cards: game.cards,
    lostAttempts: game.lostAttempts,
    gameOver: gameWon || gameLost,
    outcome: gameWon ? 'WIN' : gameLost ? 'LOSS' : null
  });
});

app.get('/api/history', requireAuth, async (req, res) => {
  const db = await getDb();
  const games = await db.all(
    'SELECT id, started_at, ended_at, outcome, total_collected FROM games WHERE user_id = ? AND ended_at IS NOT NULL ORDER BY datetime(started_at) DESC',
    [req.user.id]
  );
  const history = [];
  for (const g of games) {
    const cards = await db.all(
      `SELECT c.title, gc.won, gc.round_number, gc.is_initial
       FROM game_cards gc JOIN cards c ON gc.card_id = c.id
       WHERE gc.game_id = ? ORDER BY gc.is_initial DESC, gc.round_number ASC`,
      [g.id]
    );
    history.push({ ...g, cards });
  }
  res.json(history);
});

app.get('/api/games/:id/summary', async (req, res) => {
  const db = await getDb();
  const game = await db.get('SELECT id, user_id, outcome, total_collected, ended_at FROM games WHERE id = ? AND ended_at IS NOT NULL', [req.params.id]);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.user_id && (!req.isAuthenticated() || req.user.id !== game.user_id)) return res.status(401).json({ error: 'Unauthorized' });

  const cards = await db.all(
    `SELECT c.title, c.image_url, c.bad_luck_index
     FROM game_cards gc JOIN cards c ON gc.card_id = c.id
     WHERE gc.game_id = ? AND gc.won = 1
     ORDER BY c.bad_luck_index ASC`,
    [req.params.id]
  );
  res.json({ ...game, cards });
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
});
