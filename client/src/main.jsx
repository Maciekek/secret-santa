import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import Snow from './Snow.jsx';
import Music from './Music.jsx';
import Home from './pages/Home.jsx';
import NewDraw from './pages/NewDraw.jsx';
import NewList from './pages/NewList.jsx';
import List from './pages/List.jsx';
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
        <Music />
      </header>
      <main className="wrap">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/losowanie" element={<NewDraw />} />
          <Route path="/lista" element={<NewList />} />
          <Route path="/l/:slug" element={<List />} />
          <Route path="/l/:slug/organizator" element={<List asOrganizer />} />
          <Route path="/d/:slug" element={<Draw />} />
          <Route path="/d/:slug/organizator" element={<Organizer />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="foot">Wesołych Świąt! ✨</footer>
    </BrowserRouter>
  </StrictMode>,
);
