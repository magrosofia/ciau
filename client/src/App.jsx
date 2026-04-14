import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, Link, useNavigate } from 'react-router-dom';
import { API } from './api';
import LoginPage from './components/LoginPage';
import GamePage from './components/GamePage';
import ProfilePage from './components/ProfilePage';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    API.getUser().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  async function logout() {
    await API.logout();
    setUser(null);
    navigate('/');
  }

  if (loading) return <p className="container">Loading...</p>;

  return (
    <>
      <header>
        <h1>Stuff Happens</h1>
        <nav>
          <Link to="/">Home</Link>
          {user ? <><Link to="/game">Game</Link><Link to="/profile">Profile</Link><button onClick={logout}>Logout</button></> : <Link to="/login">Login</Link>}
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Home user={user} />} />
        <Route path="/login" element={user ? <Navigate to="/game" /> : <LoginPage onLogin={setUser} />} />
        <Route path="/game" element={<GamePage user={user} />} />
        <Route path="/profile" element={user ? <ProfilePage /> : <Navigate to="/login" />} />
      </Routes>
    </>
  );
}

function Home({ user }) {
  return (
    <main className="container">
      <h2>{user ? `Welcome ${user.name}` : 'Demo Mode Available'}</h2>
      <p>Order unlucky situations by hidden bad luck index. Reach 6 cards before 3 mistakes.</p>
      <ul>
        <li>Each round has a 30-second timer.</li>
        <li>Win guess to collect the card and reveal its index.</li>
        <li>Anonymous users can play a one-round demo game.</li>
      </ul>
      <p><Link to="/game">Start playing</Link></p>
    </main>
  );
}
