import { Link } from 'react-router-dom';
import { myDraws, myLists } from '../storage.js';
import { useTitle } from '../useTitle.js';

export default function Home() {
  useTitle('Gwiazdka — świąteczny organizator');
  const draws = myDraws.all();
  const lists = myLists.all();

  return (
    <>
      <div className="card">
        <h1 className="festive">Świąteczny organizator 🎄</h1>
        <p className="lead">Co chcesz przygotować? Zakładasz, wysyłasz link rodzinie — bez rejestracji.</p>

        <ul className="choices">
          <li>
            <Link className="choice" to="/losowanie">
              <span className="choice-icon" aria-hidden="true">🎁</span>
              <span className="choice-title">Losowanie prezentów</span>
              <span className="choice-desc">Każdy wylosuje osobę, której zrobi prezent. Nikt nie wylosuje siebie.</span>
            </Link>
          </li>
          <li>
            <Link className="choice" to="/lista">
              <span className="choice-icon" aria-hidden="true">🥟</span>
              <span className="choice-title">Kto co przynosi</span>
              <span className="choice-desc">Wspólna lista na Wigilię: każdy wpisuje, co przyniesie, i widzi, czego brakuje.</span>
            </Link>
          </li>
        </ul>
      </div>

      {(draws.length > 0 || lists.length > 0) && (
        <div className="card">
          {draws.length > 0 && (
            <>
              <h2>Twoje losowania</h2>
              <ul className="plain">
                {draws.map((d) => (
                  <li key={d.slug}>
                    <Link to={`/d/${d.slug}/organizator#${d.key}`}>{d.name}</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          {lists.length > 0 && (
            <>
              <h2>Twoje listy</h2>
              <ul className="plain">
                {lists.map((l) => (
                  <li key={l.slug}>
                    <Link to={`/l/${l.slug}/organizator#${l.key}`}>{l.name}</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </>
  );
}
