'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import TourneeMap from './TourneeMap';

const FREE_LIMIT = 3;
const MAX_DIMENSION = 1600; // suffisant pour lire du texte, assez léger pour l'envoi

// Hypothèses de l'estimation — modifiables si le terrain dit autre chose.
const ROAD_FACTOR = 1.3; // les routes ne sont pas des lignes droites
const AVG_SPEED_KMH = 25; // moyenne urbaine, feux et trafic compris
const MINUTES_PER_STOP = 4; // se garer, livrer, repartir

// Les coches et l'ordre manuel sont gardés dans l'appareil, pas sur le
// serveur : c'est ce qui permet de cocher un arrêt sans réseau.
function loadLocal(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveLocal(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // Stockage plein ou navigation privée : on continue sans mémoriser.
  }
}

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

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Estimation calculée à partir des coordonnées déjà enregistrées :
// fonctionne aussi sur les tournées passées, sans rien stocker de plus.
function computeStats(stops) {
  const list = stops || [];
  const located = list.filter((s) => s.lat != null && s.lng != null);

  let km = 0;
  for (let i = 1; i < located.length; i++) {
    km += haversineKm(located[i - 1], located[i]);
  }
  km *= ROAD_FACTOR;

  const drivingMin = (km / AVG_SPEED_KMH) * 60;
  const stopMin = list.length * MINUTES_PER_STOP;
  const totalMin = Math.round(drivingMin + stopMin);

  return { stops: list.length, located: located.length, km, totalMin };
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

function formatKm(km) {
  return km < 10 ? km.toFixed(1) : Math.round(km);
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
  const [orderedStops, setOrderedStops] = useState([]);
  const [delivered, setDelivered] = useState([]);
  const [history, setHistory] = useState([]);
  const [openStopId, setOpenStopId] = useState(null);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/connexion');
  }, [status, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setIsOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/tournees')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setHistory(data);
          saveLocal('pastexpress:history', data);
        } else {
          setHistory(loadLocal('pastexpress:history', []));
        }
      })
      .catch(() => {
        // Hors ligne : on réaffiche la dernière liste connue.
        setHistory(loadLocal('pastexpress:history', []));
      });
  }, [status]);

  if (status !== 'authenticated') return null;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const usedThisMonth = history.filter((t) => new Date(t.createdAt) >= startOfMonth).length;

  const plan = session?.user?.plan || 'FREE';
  const isPro = plan === 'PRO';
  const limitReached = !isPro && usedThisMonth >= FREE_LIMIT;

  const stats = orderedStops.length ? computeStats(orderedStops) : null;
  const doneCount = orderedStops.filter((s) => delivered.includes(s.id)).length;

  // Charge une tournée à l'écran en réappliquant l'ordre et les coches
  // mémorisés sur cet appareil.
  const showTournee = (t) => {
    const savedOrder = loadLocal(`pastexpress:order:${t.id}`, null);
    let stops = t.stops;
    if (Array.isArray(savedOrder) && savedOrder.length === t.stops.length) {
      const byId = new Map(t.stops.map((s) => [s.id, s]));
      const rebuilt = savedOrder.map((id) => byId.get(id)).filter(Boolean);
      if (rebuilt.length === t.stops.length) stops = rebuilt;
    }
    setTournee(t);
    setOrderedStops(stops);
    setDelivered(loadLocal(`pastexpress:delivered:${t.id}`, []));
    setOpenStopId(null);
  };

  const toggleDelivered = (stopId) => {
    setDelivered((prev) => {
      const next = prev.includes(stopId)
        ? prev.filter((id) => id !== stopId)
        : [...prev, stopId];
      if (tournee) saveLocal(`pastexpress:delivered:${tournee.id}`, next);
      return next;
    });
  };

  const moveStop = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= orderedStops.length) return;
    const next = [...orderedStops];
    [next[index], next[target]] = [next[target], next[index]];
    setOrderedStops(next);
    if (tournee) saveLocal(`pastexpress:order:${tournee.id}`, next.map((s) => s.id));
  };

  const resetProgress = () => {
    setDelivered([]);
    if (tournee) saveLocal(`pastexpress:delivered:${tournee.id}`, []);
  };

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
        showTournee(data);
        const nextHistory = [data, ...history];
        setHistory(nextHistory);
        saveLocal('pastexpress:history', nextHistory);
      }
    } catch (e) {
      setError(
        isOffline
          ? "Hors ligne : impossible de créer une tournée. Les tournées déjà générées restent consultables."
          : 'Impossible de contacter le serveur.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPast = (t) => {
    setError(null);
    setScanInfo(null);
    showTournee(t);
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

      {isOffline && (
        <div className="mb-4 rounded bg-amber-50 p-3 text-sm text-amber-800">
          📶 Hors ligne — tes tournées restent consultables, mais tu ne peux pas en générer
          de nouvelle pour l&apos;instant.
        </div>
      )}

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
            disabled={scanning || isOffline}
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
        disabled={loading || limitReached || isOffline}
        className="mt-4 rounded bg-navy px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {loading ? 'Génération...' : limitReached ? 'Limite atteinte' : 'Générer la tournée'}
      </button>
      {limitReached && (
        <p className="mt-2 text-xs text-gray-500">
          Passe au plan Pro pour générer des tournées illimitées ce mois-ci.
        </p>
      )}

      {tournee && stats && (
        <div ref={resultRef} className="mt-8 rounded border border-gray-200 p-4">
          <p className="mb-1 text-xs uppercase tracking-widest text-gray-400">
            Tournée du {formatDate(tournee.createdAt)}
          </p>
          {tournee.startLabel && (
            <p className="mb-2 text-xs text-gray-500">Départ : {tournee.startLabel}</p>
          )}

          {/* Résumé */}
          <div className="mb-3 grid grid-cols-3 gap-2 rounded bg-gray-50 p-3 text-center">
            <div>
              <p className="font-display text-xl">{stats.stops}</p>
              <p className="text-xs text-gray-500">arrêts</p>
            </div>
            <div>
              <p className="font-display text-xl">{formatKm(stats.km)} km</p>
              <p className="text-xs text-gray-500">estimés</p>
            </div>
            <div>
              <p className="font-display text-xl">{formatDuration(stats.totalMin)}</p>
              <p className="text-xs text-gray-500">estimées</p>
            </div>
          </div>

          {/* Avancement */}
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-semibold text-gray-700">
                {doneCount}/{stats.stops} livrés
              </span>
              {doneCount > 0 && (
                <button onClick={resetProgress} className="text-gray-400 underline">
                  Réinitialiser
                </button>
              )}
            </div>
            <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
              <div
                className="h-full bg-green-600 transition-all"
                style={{
                  width: `${stats.stops ? (doneCount / stats.stops) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          <button
            onClick={() => setShowAssumptions(!showAssumptions)}
            className="mb-3 text-xs text-gray-400 underline"
          >
            {showAssumptions ? 'Masquer le détail du calcul' : 'Comment est calculée l’estimation ?'}
          </button>
          {showAssumptions && (
            <div className="mb-3 rounded bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
              Distance à vol d’oiseau entre les arrêts, majorée de 30 % pour tenir compte des
              routes. Durée = trajet à {AVG_SPEED_KMH} km/h de moyenne + {MINUTES_PER_STOP} min
              par arrêt. Ordre de grandeur, pas un calcul d’itinéraire réel.
            </div>
          )}

          <TourneeMap key={tournee.id + orderedStops.map((s) => s.id).join('')} stops={orderedStops} />

          <ol className="space-y-3">
            {orderedStops.map((s, i) => {
              const isDone = delivered.includes(s.id);
              return (
                <li key={s.id} className="border-b border-gray-100 pb-3 last:border-0">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={() => toggleDelivered(s.id)}
                      className="mt-1 h-5 w-5 shrink-0 accent-green-600"
                      aria-label={`Marquer l'arrêt ${i + 1} comme livré`}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex gap-2 text-sm">
                        <span className="text-gray-400">{i + 1}.</span>
                        <span className={isDone ? 'text-gray-400 line-through' : ''}>
                          {s.label || s.rawAddress}
                          {!s.lat && (
                            <span className="ml-1 text-xs text-amber-600">
                              (non localisée)
                            </span>
                          )}
                        </span>
                      </div>

                      {openStopId === s.id && (
                        <div className="mt-2 flex flex-wrap gap-2">
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
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <div className="flex flex-col">
                        <button
                          onClick={() => moveStop(i, -1)}
                          disabled={i === 0}
                          className="px-1.5 text-xs text-gray-400 hover:text-navy disabled:opacity-25"
                          aria-label="Monter cet arrêt"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => moveStop(i, 1)}
                          disabled={i === orderedStops.length - 1}
                          className="px-1.5 text-xs text-gray-400 hover:text-navy disabled:opacity-25"
                          aria-label="Descendre cet arrêt"
                        >
                          ▼
                        </button>
                      </div>
                      <button
                        onClick={() => setOpenStopId(openStopId === s.id ? null : s.id)}
                        className="rounded bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                      >
                        Y aller
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
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
              const s = computeStats(t.stops);
              return (
                <li key={t.id}>
                  <button
                    onClick={() => handleOpenPast(t)}
                    className={`flex w-full items-center justify-between rounded border px-3 py-2.5 text-left text-sm hover:border-navy ${
                      isOpen ? 'border-navy bg-gray-50' : 'border-gray-200'
                    }`}
                  >
                    <span className="font-medium text-gray-700">
                      {formatDate(t.createdAt)} — {s.stops} arrêts · {formatKm(s.km)} km
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
