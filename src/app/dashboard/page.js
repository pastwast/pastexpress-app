'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import TourneeMap from './TourneeMap';

const FREE_LIMIT = 3;
const MAX_DIMENSION = 1600;

const ROAD_FACTOR = 1.3;
const AVG_SPEED_KMH = 25;
const MINUTES_PER_STOP = 4;

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
  } catch (e) {}
}

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
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
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

function computeStats(stops) {
  const list = stops || [];
  const located = list.filter((s) => s.lat != null && s.lng != null);
  let km = 0;
  for (let i = 1; i < located.length; i++) km += haversineKm(located[i - 1], located[i]);
  km *= ROAD_FACTOR;
  const totalMin = Math.round((km / AVG_SPEED_KMH) * 60 + list.length * MINUTES_PER_STOP);
  return { stops: list.length, located: located.length, km, totalMin };
}

// Compare la tournée triée à l'ordre de saisie : ce que le livreur
// aurait roulé sans l'outil.
function computeSavings(inputAddresses, sortedStops) {
  const pool = (sortedStops || []).filter((s) => s.lat != null && s.lng != null);
  if (pool.length < 3) return null;

  const remaining = [...pool];
  const originalOrder = [];
  for (const raw of inputAddresses) {
    const idx = remaining.findIndex((s) => s.rawAddress === raw);
    if (idx !== -1) originalOrder.push(remaining.splice(idx, 1)[0]);
  }
  if (originalOrder.length !== pool.length) return null;

  const before = computeStats(originalOrder);
  const after = computeStats(pool);
  const kmSaved = before.km - after.km;
  if (kmSaved <= 0.5) return null;

  return {
    kmBefore: before.km,
    kmAfter: after.km,
    kmSaved,
    minSaved: before.totalMin - after.totalMin,
    percent: Math.round((kmSaved / before.km) * 100),
  };
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
  const [startMode, setStartMode] = useState('none');
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
  const [savings, setSavings] = useState(null);
  const [animateMap, setAnimateMap] = useState(false);

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
      .catch(() => setHistory(loadLocal('pastexpress:history', [])));
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

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('Ce navigateur ne donne pas accès à la position.');
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
        setGpsStatus('Position refusée ou indisponible. Saisis une adresse de départ.');
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
        setError('Aucune adresse lisible. Reprends la photo à plat, sans reflet.');
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
      setError('Impossible de traiter cette photo.');
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
    else if (startMode === 'address' && startAddress.trim())
      start = { address: startAddress.trim() };

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
        setSavings(computeSavings(addresses, data.stops));
        setAnimateMap(true);
        const nextHistory = [data, ...history];
        setHistory(nextHistory);
        saveLocal('pastexpress:history', nextHistory);
      }
    } catch (e) {
      setError(
        isOffline
          ? 'Hors ligne : les tournées déjà générées restent consultables.'
          : 'Impossible de contacter le serveur.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPast = (t) => {
    setError(null);
    setScanInfo(null);
    setSavings(null);
    setAnimateMap(false);
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
    <>
      <header className="pe-topbar">
        <span className="pe-wordmark">
          Paste<span>Express</span>
        </span>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="pe-link"
          style={{ color: '#9aa0a8' }}
        >
          Se déconnecter
        </button>
      </header>
      <div className="pe-roadline" />

      <main className="pe-shell">
        {isOffline && (
          <div className="pe-note pe-note-signal" style={{ marginBottom: '1rem' }}>
            <strong>Hors ligne.</strong> Tes tournées restent consultables. La création
            reprendra au retour du réseau.
          </div>
        )}

        {justUpgraded && (
          <div className="pe-note pe-note-ok" style={{ marginBottom: '1rem' }}>
            Abonnement Pro activé.
          </div>
        )}

        {/* État du compte */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            flexWrap: 'wrap',
            marginBottom: '1.25rem',
          }}
        >
          <span className="pe-eyebrow">
            Plan {isPro ? 'Pro' : 'Gratuit'}
            {!isPro && ` · ${usedThisMonth}/${FREE_LIMIT} tournées ce mois-ci`}
          </span>
          {!isPro && (
            <button onClick={handleUpgrade} className="pe-btn pe-btn-signal pe-btn-sm">
              Passer Pro — 9,90 €/mois
            </button>
          )}
        </div>

        {/* Scan */}
        {isPro ? (
          <div style={{ marginBottom: '1.25rem' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleScan}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={scanning || isOffline}
              className="pe-scan"
            >
              {scanning ? 'Lecture en cours…' : '📷 Scanner la feuille'}
            </button>
          </div>
        ) : (
          <div className="pe-locked" style={{ marginBottom: '1.25rem' }}>
            <p className="pe-eyebrow">Réservé au plan Pro</p>
            <p style={{ margin: '0.5rem 0 0.85rem', fontSize: '0.88rem' }}>
              Photographie ta feuille de tournée, les adresses se remplissent seules.
            </p>
            <button onClick={handleUpgrade} className="pe-btn pe-btn-signal pe-btn-sm">
              Débloquer le scan
            </button>
          </div>
        )}

        {scanInfo && (
          <div className="pe-note" style={{ marginBottom: '1rem' }}>
            {scanInfo}
          </div>
        )}

        {/* Départ */}
        <p className="pe-label">Point de départ</p>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
          <button
            onClick={handleUseGps}
            data-on={startMode === 'gps'}
            className="pe-btn pe-btn-ghost pe-btn-sm"
          >
            Ma position
          </button>
          <button
            onClick={() => setStartMode('address')}
            data-on={startMode === 'address'}
            className="pe-btn pe-btn-ghost pe-btn-sm"
          >
            Dépôt
          </button>
          <button
            onClick={() => setStartMode('none')}
            data-on={startMode === 'none'}
            className="pe-btn pe-btn-ghost pe-btn-sm"
          >
            Sans départ
          </button>
        </div>

        {startMode === 'gps' && gpsStatus && (
          <p className="pe-eyebrow" style={{ marginBottom: '0.75rem' }}>
            {gpsStatus}
          </p>
        )}

        {startMode === 'address' && (
          <input
            type="text"
            value={startAddress}
            onChange={(e) => setStartAddress(e.target.value)}
            placeholder="12 rue du Dépôt, 76000 Rouen"
            className="pe-field"
            style={{ marginBottom: '1rem' }}
          />
        )}

        <label className="pe-label" style={{ marginTop: '1.25rem' }}>
          Adresses — une par ligne
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={7}
          placeholder={'12 rue des Lilas, 76000 Rouen\n4 avenue Foch, 76300 Sotteville'}
          className="pe-field"
        />

        {error && (
          <div className="pe-note pe-note-alerte" style={{ marginTop: '0.75rem' }}>
            {error}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={loading || limitReached || isOffline}
          className="pe-btn"
          style={{ marginTop: '1rem', width: '100%' }}
        >
          {loading ? 'Tri en cours…' : limitReached ? 'Limite atteinte' : 'Trier la tournée'}
        </button>

        {limitReached && (
          <p className="pe-eyebrow" style={{ marginTop: '0.5rem' }}>
            Plan Pro requis pour continuer ce mois-ci.
          </p>
        )}

        {/* ---- Résultat ---- */}
        {tournee && stats && (
          <section ref={resultRef} style={{ marginTop: '2.5rem' }}>
            <div className="pe-roadline" style={{ marginBottom: '1.25rem' }} />

            <p className="pe-eyebrow">
              Tournée du {formatDate(tournee.createdAt)}
              {tournee.startLabel ? ` · départ ${tournee.startLabel}` : ''}
            </p>

            {savings && (
              <div
                className="pe-note pe-note-ok"
                style={{ marginTop: '0.85rem', marginBottom: '1rem' }}
              >
                <p className="pe-display" style={{ fontSize: '1.35rem', margin: 0 }}>
                  {Math.round(savings.kmSaved)} km &amp; {formatDuration(savings.minSaved)} en
                  moins
                </p>
                <p className="pe-mono" style={{ fontSize: '0.72rem', margin: '0.4rem 0 0' }}>
                  {formatKm(savings.kmBefore)} km dans ton ordre → {formatKm(savings.kmAfter)} km
                  triés · −{savings.percent} %
                </p>
              </div>
            )}

            <div className="pe-gauges" style={{ margin: '1rem 0' }}>
              <div className="pe-gauge">
                <p className="pe-gauge-value">{stats.stops}</p>
                <p className="pe-gauge-label">arrêts</p>
              </div>
              <div className="pe-gauge">
                <p className="pe-gauge-value">{formatKm(stats.km)}</p>
                <p className="pe-gauge-label">km estimés</p>
              </div>
              <div className="pe-gauge">
                <p className="pe-gauge-value">{formatDuration(stats.totalMin)}</p>
                <p className="pe-gauge-label">durée estimée</p>
              </div>
            </div>

            <div style={{ margin: '1rem 0' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: '0.4rem',
                }}
              >
                <span className="pe-mono" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  {doneCount} / {stats.stops} livrés
                </span>
                {doneCount > 0 && (
                  <button onClick={resetProgress} className="pe-link">
                    Tout décocher
                  </button>
                )}
              </div>
              <div className="pe-progress">
                <div
                  className="pe-progress-fill"
                  style={{ width: `${stats.stops ? (doneCount / stats.stops) * 100 : 0}%` }}
                />
              </div>
            </div>

            <button onClick={() => setShowAssumptions(!showAssumptions)} className="pe-link">
              {showAssumptions ? 'Masquer le calcul' : 'Comment ces chiffres sont calculés'}
            </button>
            {showAssumptions && (
              <p
                className="pe-mono"
                style={{ fontSize: '0.72rem', lineHeight: 1.6, color: 'var(--gris)' }}
              >
                Distance à vol d’oiseau +30 % pour les routes. Durée = {AVG_SPEED_KMH} km/h de
                moyenne + {MINUTES_PER_STOP} min par arrêt. Ordre de grandeur, pas un calcul
                d’itinéraire.
              </p>
            )}

            <div style={{ margin: '1.25rem 0' }}>
              <TourneeMap
                key={tournee.id + orderedStops.map((s) => s.id).join('')}
                stops={orderedStops}
                animate={animateMap}
              />
            </div>

            {/* SIGNATURE : la route jalonnée de bornes */}
            <ol className="pe-route">
              {orderedStops.map((s, i) => {
                const isDone = delivered.includes(s.id);
                return (
                  <li key={s.id} className="pe-stop" data-done={isDone}>
                    <button
                      className="pe-borne"
                      onClick={() => toggleDelivered(s.id)}
                      aria-pressed={isDone}
                      aria-label={`Arrêt ${i + 1}, ${isDone ? 'livré' : 'à livrer'}`}
                    >
                      {isDone ? '✓' : i + 1}
                    </button>

                    <div className="pe-stop-body">
                      <p className="pe-adresse" style={{ margin: 0 }}>
                        {s.label || s.rawAddress}
                      </p>
                      {!s.lat && <span className="pe-flag">non localisée</span>}

                      {openStopId === s.id && (
                        <div
                          style={{
                            display: 'flex',
                            gap: '0.4rem',
                            flexWrap: 'wrap',
                            marginTop: '0.5rem',
                          }}
                        >
                          <a
                            href={wazeUrl(s)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="pe-btn pe-btn-ghost pe-btn-sm"
                          >
                            Waze
                          </a>
                          <a
                            href={appleMapsUrl(s)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="pe-btn pe-btn-ghost pe-btn-sm"
                          >
                            Plans
                          </a>
                          <a
                            href={googleMapsUrl(s)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="pe-btn pe-btn-ghost pe-btn-sm"
                          >
                            Google Maps
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="pe-actions">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <button
                          onClick={() => moveStop(i, -1)}
                          disabled={i === 0}
                          className="pe-nudge"
                          aria-label="Monter cet arrêt"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => moveStop(i, 1)}
                          disabled={i === orderedStops.length - 1}
                          className="pe-nudge"
                          aria-label="Descendre cet arrêt"
                        >
                          ▼
                        </button>
                      </div>
                      <button
                        onClick={() => setOpenStopId(openStopId === s.id ? null : s.id)}
                        className="pe-btn pe-btn-sm"
                      >
                        Y aller
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {history.length > 0 && (
          <section style={{ marginTop: '3rem' }}>
            <p className="pe-eyebrow" style={{ marginBottom: '0.75rem' }}>
              Tournées précédentes
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {history.map((t) => {
                const isOpen = tournee?.id === t.id;
                const s = computeStats(t.stops);
                return (
                  <li key={t.id} style={{ marginBottom: '0.5rem' }}>
                    <button
                      onClick={() => handleOpenPast(t)}
                      className="pe-card"
                      style={{
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.75rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        borderColor: isOpen ? 'var(--asphalte)' : 'var(--trait)',
                        borderWidth: isOpen ? '2px' : '1px',
                      }}
                    >
                      <span className="pe-mono" style={{ fontSize: '0.82rem' }}>
                        {formatDate(t.createdAt)} · {s.stops} arrêts · {formatKm(s.km)} km
                      </span>
                      <span className="pe-eyebrow">{isOpen ? 'à l’écran' : 'ouvrir'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

export default function Dashboard() {
  return (
    <Suspense
      fallback={
        <main className="pe-shell">
          <p className="pe-eyebrow">Chargement…</p>
        </main>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
