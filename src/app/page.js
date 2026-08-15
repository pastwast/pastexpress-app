import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <header className="flex items-center justify-between px-6 py-5 md:px-12">
        <span className="font-display text-lg tracking-tight">PASTEXPRESS</span>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/connexion" className="text-gray-600 hover:text-gray-900">
            Connexion
          </Link>
          <Link
            href="/inscription"
            className="rounded bg-navy px-4 py-2 font-semibold text-white hover:opacity-90"
          >
            Essayer gratuitement
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-20 text-center md:py-28">
        <span className="inline-block rounded-full border border-kraft px-3 py-1 text-xs uppercase tracking-widest text-black/60">
          Pour les tournées de livraison
        </span>
        <h1 className="font-display mt-5 text-4xl leading-tight md:text-6xl">
          Une pile d&apos;adresses.
          <br />
          <span className="text-stamp">Une tournée triée.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-gray-600">
          Colle ta liste de clients, PasteExpress géocode chaque adresse et ordonne les
          arrêts pour que le livreur roule dans le bon sens, du premier au dernier.
        </p>
        <Link
          href="/inscription"
          className="mt-8 inline-block rounded bg-stamp px-6 py-3 font-semibold text-white hover:opacity-90"
        >
          Commencer gratuitement
        </Link>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-8">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { n: '01', t: 'Colle ta liste', d: 'Une adresse par ligne, comme un export de commandes.' },
            { n: '02', t: 'Génère la tournée', d: 'Chaque adresse est géocodée puis ordonnée par proximité.' },
            { n: '03', t: 'Donne-la au livreur', d: 'Un manifeste clair, prêt à suivre arrêt par arrêt.' },
          ].map((s) => (
            <div key={s.n} className="rounded border-l-4 border-kraft bg-white p-5 shadow-sm">
              <span className="font-display text-2xl text-kraft">{s.n}</span>
              <h3 className="mt-2 font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm text-gray-600">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="tarifs" className="mx-auto max-w-4xl px-6 py-16">
        <h2 className="font-display mb-8 text-2xl">Tarifs</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded border border-gray-200 p-6">
            <p className="text-sm font-bold uppercase text-green-700">Gratuit</p>
            <p className="font-display mt-2 text-3xl">0€</p>
            <p className="mt-2 text-sm text-gray-600">3 tournées par mois</p>
          </div>
          <div className="rounded border-2 border-stamp p-6">
            <p className="text-sm font-bold uppercase text-stamp">Pro</p>
            <p className="font-display mt-2 text-3xl">
              9,90€<span className="text-base font-normal text-gray-500"> / mois</span>
            </p>
            <p className="mt-2 text-sm text-gray-600">Tournées illimitées + historique</p>
          </div>
        </div>
      </section>

      <footer className="px-6 py-8 text-center text-xs text-gray-400 md:px-12">
        PasteExpress
      </footer>
    </main>
  );
}
