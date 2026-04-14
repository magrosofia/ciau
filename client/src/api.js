const SERVER = 'http://localhost:3001/api';

async function req(path, options = {}) {
  const response = await fetch(`${SERVER}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? 'Request failed');
  }
  if (response.status === 204) return null;
  return response.json();
}

export const API = {
  getUser: () => req('/sessions/current'),
  login: (username, password) => req('/sessions', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => req('/sessions/current', { method: 'DELETE' }),
  startGame: () => req('/games', { method: 'POST' }),
  startDemo: () => req('/demo-games', { method: 'POST' }),
  nextRound: (id) => req(`/games/${id}/round`),
  guess: (id, slot, timedOut = false) => req(`/games/${id}/guess`, { method: 'POST', body: JSON.stringify({ slot, timedOut }) }),
  history: () => req('/history'),
  summary: (id) => req(`/games/${id}/summary`)
};
