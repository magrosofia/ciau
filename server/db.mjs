import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import crypto from 'crypto';

const DB_PATH = './stuff-happens.sqlite';

export async function getDb() {
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });
  await db.exec('PRAGMA foreign_keys = ON');
  return db;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const iterations = 100000;
  const keylen = 64;
  const digest = 'sha512';
  const hash = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, user) {
  const hash = crypto.pbkdf2Sync(password, user.salt, 100000, 64, 'sha512').toString('hex');
  return hash === user.password_hash;
}

export async function initDb() {
  const db = await getDb();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      image_url TEXT NOT NULL,
      bad_luck_index REAL UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      outcome TEXT,
      total_collected INTEGER DEFAULT 0,
      is_demo INTEGER DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS game_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      card_id INTEGER NOT NULL,
      round_number INTEGER,
      won INTEGER NOT NULL,
      is_initial INTEGER NOT NULL,
      FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE,
      FOREIGN KEY(card_id) REFERENCES cards(id)
    );
  `);

  const cardCount = await db.get('SELECT COUNT(*) as c FROM cards');
  if (cardCount.c < 50) {
    await db.run('DELETE FROM cards');
    const themes = [
      'You miss your final exam alarm',
      'Laptop crashes before thesis deadline',
      'You lose your student ID card',
      'Your project repo gets corrupted',
      'Roommate throws a surprise party before exam',
      'You spill coffee on your notes',
      'Group members ghost your team project',
      'You board wrong train for internship interview',
      'Phone battery dies during navigation',
      'Flight gets canceled at the airport'
    ];
    const stmt = await db.prepare('INSERT INTO cards(title, image_url, bad_luck_index) VALUES (?, ?, ?)');
    for (let i = 1; i <= 50; i++) {
      const index = Number((i * 1.9 + 2).toFixed(1));
      const title = `${themes[i % themes.length]} #${i}`;
      const image = `https://picsum.photos/seed/stuff-${i}/400/250`;
      await stmt.run(title, image, index);
    }
    await stmt.finalize();
  }

  const usersCount = await db.get('SELECT COUNT(*) as c FROM users');
  if (usersCount.c === 0) {
    const u1 = hashPassword('password');
    const u2 = hashPassword('secret');
    await db.run('INSERT INTO users(username, name, salt, password_hash) VALUES (?, ?, ?, ?)', ['alice', 'Alice Wonder', u1.salt, u1.hash]);
    await db.run('INSERT INTO users(username, name, salt, password_hash) VALUES (?, ?, ?, ?)', ['bob', 'Bob Stone', u2.salt, u2.hash]);

    const bob = await db.get('SELECT id FROM users WHERE username=?', ['bob']);
    const game = await db.run(
      'INSERT INTO games(user_id, started_at, ended_at, outcome, total_collected, is_demo) VALUES (?, datetime("now", "-1 day"), datetime("now", "-1 day", "+10 minutes"), ?, ?, 0)',
      [bob.id, 'WIN', 6]
    );
    const selected = await db.all('SELECT id FROM cards ORDER BY bad_luck_index LIMIT 6');
    for (let i = 0; i < selected.length; i++) {
      await db.run('INSERT INTO game_cards(game_id, card_id, round_number, won, is_initial) VALUES (?, ?, ?, 1, ?)', [game.lastID, selected[i].id, i < 3 ? null : i - 2, i < 3 ? 1 : 0]);
    }
  }

  return { db, verifyPassword };
}

export { verifyPassword };
