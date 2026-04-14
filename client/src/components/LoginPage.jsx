import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API } from '../api';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('alice');
  const [password, setPassword] = useState('password');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const user = await API.login(username, password);
      onLogin(user);
      navigate('/game');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="container">
      <h2>Login</h2>
      <form onSubmit={handleSubmit} className="panel">
        <label>Username <input value={username} onChange={(e) => setUsername(e.target.value)} /></label>
        <label>Password <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button>Login</button>
        {error && <p className="error">{error}</p>}
      </form>
      <p>Try alice/password or bob/secret.</p>
    </main>
  );
}
