'use client';
 
import { useState, useEffect, useRef, Suspense } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import TourneeMap from './TourneeMap';
 
const FREE_LIMIT = 3;
const MAX_DIMENSION = 1600; // suffisant pour lire du texte, assez léger pour l'envoi
 
// Redimensionne et compresse la photo dans le navigateur avant l'envoi.
// Une photo de téléphone brute fait 5 à 10 Mo, bien trop pour l'API.
function fileToResizedBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image illisible.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(dataUrl.split(',')[1]);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
 
// Les coordonnées sont plus fiables que le texte pour un GPS :
// on les utilise dès qu'on les a, sinon on retombe sur l'adresse écrite.
function stopTarget(stop) {
  if (stop.lat != null && stop.lng != null) return `${stop.lat},${stop.lng}`;
  return stop.label || stop.rawAddress;
}
 
function wazeUrl(stop) {
  if (stop.lat != null && stop.lng != null) {
    return `https://waze.com/ul?ll=${stop.lat}%2C${stop.lng}&navigate=yes`;
  }
  return `https://waze.com/ul?q=${encodeURIComponent(stop.rawAddress)}&navigate=yes`;
}
 
function appleMapsUrl(stop) {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(stopTarget(stop))}&dirflg=d`;
}
 
function googleMapsUrl(stop) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    stopTarget(stop)
  )}&travelmode=driving`;
}
 
function formatDate(value) {
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
 
function DashboardContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const justUpgraded = searchParams.get('abonnement') === 'succes';
  const fileInputRef = useRef(null);
  const resultRef = useRef(null);
 
  const [input, setInput] = useState('');
  const [startMode, setStartMode] = useState('none'); // none | gps | address
  const [startAddress, setStartAddress] = useState('');
  const [gpsPosition, setGpsPosition] = useState(null);
  const [gpsStatus, setGpsStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanInfo, setScanInfo] = useState(null);
  const [error, setError] = useState(null);
  const [tournee, setTournee] = useState(null);
  const [history, setHistory] = useState([]);
  const [openStopId, setOpenStopId] = useState(null);
 
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/connexion');
  }, [status, router]);
 
  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/tournees')
        .then((r) => r.json())
        .then((data) => setHistory(Array.isArray(data) ? data : []))
        .catch(() => {});
    }
  }, [status]);
 
  if (status !== 'authenticated') return null;
 
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const usedThisMonth = history.filter((t) => new Date(t.createdAt) >= startOfMonth).length;
 
  const plan = session?.user?.plan || 'FREE';
  const isPro = plan === 'PRO';
  const limitReached = !isPro && usedThisMonth >= FREE_LIMIT;
 
  // La position n'est demandée qu'au moment où le livreur la choisit,
  // et n'est jamais enregistrée en base.
  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus("Ce navigateur ne donne pas accès à la position.");
      return;
    }
    setStartMode('gps');
    setGpsStatus('Localisation en cours…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus('Position trouvée.');
      },
      () => {
        setGpsPosition(null);
        setGpsStatus("Position refusée ou indisponible. Saisis une adresse de départ.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
 
  const handleScan = async (e) => {
    const file = e.target.files?.[0];
    // Permet de rescanner la même photo si besoin
    e.target.value = '';
    if (!file) return;
 
    setError(null);
    setScanInfo(null);
    setScanning(true);
 
    try {
      const imageBase64 = await fileToResizedBase64(file);
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mediaType: 'image/jpeg' }),
      });
      const data = await res.json();
 
      if (!res.ok) {
        setError(data.error || 'La lecture a échoué.');
        return;
      }
 
      if (!data.addresses || data.addresses.length === 0) {
        setError("Aucune adresse lisible sur cette photo. Essaie avec plus de lumière, à plat, sans reflet.");
        return;
      }
 
      // On ajoute à ce qui est déjà saisi, pour permettre de scanner
      // plusieurs feuilles à la suite.
      setInput((prev) => {
        const existing = prev.trim();
        const scanned = data.addresses.join('\n');
        return existing ? `${existing}\n${scanned}` : scanned;
      });
      setScanInfo(
        `${data.addresses.length} adresse${data.addresses.length > 1 ? 's' : ''} lue${
          data.addresses.length > 1 ? 's' : ''
        }. Vérifie-les avant de générer.`
      );
    } catch (err) {
      setError("Impossible de traiter cette photo.");
    } finally {
      setScanning(false);
    }
  };
 
  const handleGenerate = async () => {
    setError(null);
    setScanInfo(null);
    setOpenStopId(null);
    const addresses = input.split('\n').map((l) => l.trim()).filter(Boolean);
    if (addresses.length === 0) return;
 
    let start = null;
    if (startMode === 'gps' && gpsPosition) start = gpsPosition;
    else if (startMode === 'address' && startAddress.trim()) {
      start = { address: startAddress.trim() };
    }
 
    setLoading(true);
    try {
      const res = await fetch('/api/tournees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses, start }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Une erreur est survenue.');
      } else {
        setTournee(data);
        setHistory((h) => [data, ...h]);
      }
    } catch (e) {
      setError('Impossible de contacter le serveur.');
    } finally {
      setLoading(false);
    }
  };
 
  // Rouvrir une tournée déjà triée : tout est déjà en base, rien à recalculer.
  const handleOpenPast = (t) => {
    setError(null);
    setScanInfo(null);
    setOpenStopId(null);
    setTournee(t);
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };
 
  const handleUpgrade = async () => {
    const res = await fetch('/api/stripe/checkout', { method: 'POST' });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else setError(data.error || "Impossible d'ouvrir le paiement.");
  };
 
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-2xl">Tableau de bord</h1>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="text-sm text-gray-500 underline"
        >
          Se déconnecter
        </button>
      </div>
 
      {justUpgraded && (
        <div className="mb-4 rounded bg-green-50 p-3 text-sm text-green-700">
          Abonnement Pro activé 🎉
        </div>
      )}
 
      <div className="mb-6 rounded border border-gray-200 bg-gray-50 p-4 text-sm">
        Plan <strong>{isPro ? 'Pro' : 'Gratuit'}</strong>
        {!isPro && (
          <>
            {' '}
            — {usedThisMonth}/{FREE_LIMIT} tournées utilisées ce mois-ci.{' '}
            <button onClick={handleUpgrade} className="font-semibold text-stamp underline">
              Passer Pro (9,90€/mois)
            </button>
          </>
        )}
      </div>
 
      {/* Scan photo — réservé au plan Pro */}
      {isPro ? (
        <div className="mb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleScan}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={scanning}
            className="flex w-full items-center justify-center gap-2 rounded border-2 border-dashed border-gray-300 py-4 text-sm font-semibold text-gray-700 hover:border-navy hover:text-navy disabled:opacity-50"
          >
            {scanning ? 'Lecture de la photo…' : '📷 Scanner une feuille de tournée'}
          </button>
          <p className="mt-1 text-center text-xs text-gray-400">
            Photographie ta feuille, les adresses se remplissent toutes seules.
          </p>
        </div>
      ) : (
        <div className="mb-4 rounded border-2 border-dashed border-gray-200 bg-gray-50 py-5 text-center">
          <p className="text-sm font-semibold text-gray-500">
            🔒 Scan photo — réservé au plan Pro
          </p>
          <p className="mt-1 px-4 text-xs text-gray-500">
            Photographie ta feuille de tournée, les adresses se remplissent toutes seules.
          </p>
          <button
            onClick={handleUpgrade}
            className="mt-3 rounded bg-stamp px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Débloquer pour 9,90€/mois
          </button>
        </div>
      )}
 
      {scanInfo && (
        <div className="mb-3 rounded bg-blue-50 p-3 text-sm text-blue-800">{scanInfo}</div>
      )}
 
      {/* Point de départ */}
      <div className="mb-5 rounded border border-gray-200 p-3">
        <p className="mb-2 text-sm font-medium">Point de départ</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleUseGps}
            className={`rounded border px-3 py-1.5 text-xs font-medium ${
              startMode === 'gps'
                ? 'border-navy bg-navy text-white'
                : 'border-gray-300 text-gray-700 hover:border-navy'
            }`}
          >
            📍 Ma position
          </button>
          <button
            onClick={() => setStartMode('address')}
            className={`rounded border px-3 py-1.5 text-xs font-medium ${
              startMode === 'address'
                ? 'border-navy bg-navy text-white'
                : 'border-gray-300 text-gray-700 hover:border-navy'
            }`}
          >
            🏢 Adresse du dépôt
          </button>
          <button
            onClick={() => setStartMode('none')}
            className={`rounded border px-3 py-1.5 text-xs font-medium ${
              startMode === 'none'
                ? 'border-navy bg-navy text-white'
                : 'border-gray-300 text-gray-700 hover:border-navy'
            }`}
          >
            Sans départ
          </button>
        </div>
 
        {startMode === 'gps' && gpsStatus && (
          <p className="mt-2 text-xs text-gray-500">{gpsStatus}</p>
        )}
 
        {startMode === 'address' && (
          <input
            type="text"
            value={startAddress}
            onChange={(e) => setStartAddress(e.target.value)}
            placeholder="12 rue du Dépôt, 76000 Rouen"
            className="mt-2 w-full rounded border border-gray-300 p-2 text-sm focus:border-navy focus:outline-none"
          />
        )}
      </div>
 
      <label className="mb-2 block text-sm font-medium">Adresses (une par ligne)</label>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={8}
        placeholder={'12 rue des Lilas, 75011 Paris\n4 avenue Foch, 75016 Paris'}
        className="w-full rounded border border-gray-300 p-3 font-mono text-sm focus:border-navy focus:outline-none"
      />
 
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
 
      <button
        onClick={handleGenerate}
        disabled={loading || limitReached}
        className="mt-4 rounded bg-navy px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {loading ? 'Génération...' : limitReached ? 'Limite atteinte' : 'Générer la tournée'}
      </button>
      {limitReached && (
        <p className="mt-2 text-xs text-gray-500">
          Passe au plan Pro pour générer des tournées illimitées ce mois-ci.
        </p>
      )}
 
      {tournee && (
        <div ref={resultRef} className="mt-8 rounded border border-gray-200 p-4">
          <p className="mb-1 text-xs uppercase tracking-widest text-gray-400">
            Tournée du {formatDate(tournee.createdAt)} — {tournee.stops.length} arrêts
          </p>
          {tournee.startLabel && (
            <p className="mb-3 text-xs text-gray-500">Départ : {tournee.startLabel}</p>
          )}
 
          <div className="mt-3">
            <TourneeMap key={tournee.id} stops={tournee.stops} />
          </div>
 
          <ol className="space-y-3">
            {tournee.stops.map((s, i) => (
              <li key={s.id} className="border-b border-gray-100 pb-3 last:border-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3 text-sm">
                    <span className="text-gray-400">{i + 1}.</span>
                    <span>
                      {s.label || s.rawAddress}
                      {!s.lat && (
                        <span className="ml-1 text-xs text-amber-600">(non localisée)</span>
                      )}
                    </span>
                  </div>
                  <button
                    onClick={() => setOpenStopId(openStopId === s.id ? null : s.id)}
                    className="shrink-0 rounded bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                  >
                    Y aller
                  </button>
                </div>
 
                {openStopId === s.id && (
                  <div className="ml-6 mt-2 flex flex-wrap gap-2">
                    <a
                      href={wazeUrl(s)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-navy hover:text-navy"
                    >
                      Waze
                    </a>
                    <a
                      href={appleMapsUrl(s)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-navy hover:text-navy"
                    >
                      Plans
                    </a>
                    <a
                      href={googleMapsUrl(s)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-navy hover:text-navy"
                    >
                      Google Maps
                    </a>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
 
      {history.length > 0 && (
        <div className="mt-10">
          <p className="mb-3 text-xs uppercase tracking-widest text-gray-400">
            Tournées précédentes
          </p>
          <ul className="space-y-2">
            {history.map((t) => {
              const isOpen = tournee?.id === t.id;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => handleOpenPast(t)}
                    className={`flex w-full items-center justify-between rounded border px-3 py-2.5 text-left text-sm hover:border-navy ${
                      isOpen ? 'border-navy bg-gray-50' : 'border-gray-200'
                    }`}
                  >
                    <span className="font-medium text-gray-700">
                      {formatDate(t.createdAt)} — {t.stops.length} arrêts
                    </span>
                    <span className="text-xs text-gray-500">
                      {isOpen ? 'Affichée' : 'Rouvrir'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </main>
  );
}
 
export default function Dashboard() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-4xl px-6 py-10">Chargement…</main>}>
      <DashboardContent />
    </Suspense>
  );
}
