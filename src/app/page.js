import Link from 'next/link';

export default function Home() {
  return (
    <>
      <header className="pe-topbar">
        <span className="pe-wordmark">
          Paste<span>Express</span>
        </span>
        <nav style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Link href="/connexion" className="pe-link" style={{ color: '#9aa0a8' }}>
            Connexion
          </Link>
          <Link href="/inscription" className="pe-btn pe-btn-signal pe-btn-sm">
            Essayer
          </Link>
        </nav>
      </header>
      <div className="pe-roadline" />

      <main className="pe-shell">
        {/* Hero : la promesse en une opération, pas en un slogan */}
        <section style={{ padding: '2.5rem 0 1rem' }}>
          <p className="pe-eyebrow">Tournées de livraison · France</p>
          <h1
            className="pe-display"
            style={{ fontSize: 'clamp(2.6rem, 11vw, 4.5rem)', margin: '0.75rem 0 0' }}
          >
            Une pile
            <br />
            d’adresses.
            <br />
            <span style={{ color: 'var(--rouge)' }}>Une route.</span>
          </h1>
          <p
            style={{
              maxWidth: '34ch',
              margin: '1.25rem 0 0',
              fontSize: '1rem',
              lineHeight: 1.5,
              color: '#3c4149',
            }}
          >
            Photographie ta feuille de tournée. PasteExpress lit les adresses, les remet dans
            l’ordre de la route et t’ouvre le GPS arrêt par arrêt.
          </p>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
            <Link href="/inscription" className="pe-btn">
              Trier ma première tournée
            </Link>
            <a href="#tarifs" className="pe-btn pe-btn-ghost">
              Tarifs
            </a>
          </div>
        </section>

        {/* Démonstration statique du tri : avant / après */}
        <section style={{ margin: '3rem 0' }}>
          <div className="pe-gauges">
            <div className="pe-gauge">
              <p className="pe-gauge-value">48</p>
              <p className="pe-gauge-label">km sans tri</p>
            </div>
            <div className="pe-gauge" style={{ background: 'var(--jaune)' }}>
              <p className="pe-gauge-value">34</p>
              <p className="pe-gauge-label">km triés</p>
            </div>
            <div className="pe-gauge">
              <p className="pe-gauge-value">35</p>
              <p className="pe-gauge-label">min gagnées</p>
            </div>
          </div>
          <p className="pe-eyebrow" style={{ marginTop: '0.6rem' }}>
            Exemple sur 26 arrêts en agglomération rouennaise
          </p>
        </section>

        {/* Le parcours, présenté comme une route */}
        <section style={{ margin: '3rem 0' }}>
          <ol className="pe-route">
            {[
              ['Photographie', 'Ta feuille de tournée, imprimée ou manuscrite.'],
              ['Trie', 'Les adresses sont géocodées et remises dans l’ordre.'],
              ['Roule', 'Waze, Plans ou Google Maps s’ouvrent à chaque arrêt.'],
            ].map(([titre, texte], i) => (
              <li key={titre} className="pe-stop">
                <span className="pe-borne" style={{ cursor: 'default' }}>
                  {i + 1}
                </span>
                <div className="pe-stop-body">
                  <p className="pe-display" style={{ fontSize: '1.05rem', margin: 0 }}>
                    {titre}
                  </p>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.88rem', color: '#4a4f57' }}>
                    {texte}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Tarifs */}
        <section id="tarifs" style={{ margin: '3rem 0' }}>
          <div className="pe-roadline" style={{ marginBottom: '1.5rem' }} />
          <p className="pe-eyebrow">Tarifs</p>

          <div
            style={{
              display: 'grid',
              gap: '0.75rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              marginTop: '1rem',
            }}
          >
            <div className="pe-card">
              <p className="pe-eyebrow">Gratuit</p>
              <p className="pe-display" style={{ fontSize: '2.2rem', margin: '0.4rem 0' }}>
                0 €
              </p>
              <p style={{ fontSize: '0.85rem', color: '#4a4f57', margin: 0 }}>
                3 tournées par mois, tri et navigation compris.
              </p>
            </div>

            <div className="pe-card" style={{ borderColor: 'var(--asphalte)', borderWidth: '2px' }}>
              <p className="pe-eyebrow" style={{ color: 'var(--rouge)' }}>
                Pro
              </p>
              <p className="pe-display" style={{ fontSize: '2.2rem', margin: '0.4rem 0' }}>
                9,90 €
                <span
                  className="pe-mono"
                  style={{ fontSize: '0.7rem', fontWeight: 400, marginLeft: '0.4rem' }}
                >
                  / mois
                </span>
              </p>
              <p style={{ fontSize: '0.85rem', color: '#4a4f57', margin: 0 }}>
                Tournées illimitées, scan photo des feuilles, historique complet.
              </p>
            </div>
          </div>

          <Link
            href="/inscription"
            className="pe-btn pe-btn-signal"
            style={{ marginTop: '1.25rem', width: '100%' }}
          >
            Commencer gratuitement
          </Link>
        </section>
      </main>

      <footer style={{ background: 'var(--asphalte)', color: '#9aa0a8', padding: '1.5rem' }}>
        <p className="pe-eyebrow" style={{ margin: 0 }}>
          PasteExpress · France
        </p>
      </footer>
    </>
  );
}
