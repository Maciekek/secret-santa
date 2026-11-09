import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import Snow, { SnowToggle } from './Snow.jsx';
import Home from './pages/Home.jsx';
import Draw from './pages/Draw.jsx';
import Organizer from './pages/Organizer.jsx';
import Admin from './pages/Admin.jsx';
import './styles.css';

function NotFound() {
  return (
    <div className="card center">
      <h2>Renifer zgubił drogę 🦌</h2>
      <p>Tej strony nie ma.</p>
      <Link className="btn" to="/">Na stronę główną</Link>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Snow />
      <header className="top">
        <Link to="/" className="logo">🎄 Gwiazdka</Link>
      </header>
      <main className="wrap">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/d/:slug" element={<Draw />} />
          <Route path="/d/:slug/organizator" element={<Organizer />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="foot">
        <span>Wesołych Świąt! ✨</span>
        <SnowToggle />
      </footer>
    </BrowserRouter>
  </StrictMode>,
);
