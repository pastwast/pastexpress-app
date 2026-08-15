'use client';
 
import { useEffect, useRef, useState } from 'react';
 
// Leaflet est chargé depuis un CDN plutôt qu'installé en dépendance :
// pas de modification de package.json, et la carte reste optionnelle.
function loadLeaflet() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('Pas de fenêtre navigateur'));
    if (window.L) return resolve(window.L);
 
    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.setAttribute('data-leaflet', 'true');
      document.head.appendChild(link);
    }
 
    const existing = document.querySelector('script[data-leaflet]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.L));
      existing.addEventListener('error', () =>
        reject(new Error('Chargement de Leaflet impossible (script existant)'))
      );
      return;
    }
 
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.setAttribute('data-leaflet', 'true');
    script.onload = () => {
      if (window.L) resolve(window.L);
      else reject(new Error('Leaflet chargé mais window.L absent'));
    };
    script.onerror = () => reject(new Error('CDN Leaflet injoignable'));
    document.head.appendChild(script);
  });
}
 
export default function TourneeMap({ stops }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapError, setMapError] = useState(null);
 
  const located = (stops || []).filter((s) => s.lat != null && s.lng != null);
 
  useEffect(() => {
    let cancelled = false;
    setMapError(null);
 
    if (located.length === 0) return;
 
    loadLeaflet()
      .then((L) => {
        if (cancelled) return;
        if (!containerRef.current) {
          setMapError("Conteneur de carte introuvable.");
          return;
        }
 
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
 
        const map = L.map(containerRef.current, { scrollWheelZoom: false });
        mapRef.current = map;
 
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap',
        }).addTo(map);
 
        const latlngs = located.map((s) => [s.lat, s.lng]);
 
        L.polyline(latlngs, { color: '#1B2A4A', weight: 3, opacity: 0.6 }).addTo(map);
 
        located.forEach((s, i) => {
          const icon = L.divIcon({
            className: '',
            html: `<div style="background:#B23A2C;color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);">${
              i + 1
            }</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          });
 
          L.marker([s.lat, s.lng], { icon })
            .addTo(map)
            .bindPopup(`<strong>${i + 1}.</strong> ${s.label || s.rawAddress}`);
        });
 
        map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] });
 
        // La carte est parfois créée avant que le conteneur ait sa taille finale.
        setTimeout(() => {
          if (mapRef.current) mapRef.current.invalidateSize();
        }, 200);
      })
      .catch((err) => {
        if (!cancelled) setMapError(err.message || 'Erreur inconnue');
      });
 
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [stops]);
 
  if (located.length === 0) {
    return (
      <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        Carte indisponible : aucune adresse de cette tournée n&apos;a de coordonnées.
      </div>
    );
  }
 
  return (
    <div className="mb-4">
      <div
        ref={containerRef}
        style={{ height: '290px', width: '100%', zIndex: 0 }}
        className="rounded border border-gray-200 bg-gray-100"
      />
      {mapError && (
        <p className="mt-1 rounded bg-red-50 p-2 text-xs text-red-700">
          Carte non affichée : {mapError}
        </p>
      )}
      {located.length < (stops || []).length && (
        <p className="mt-1 text-xs text-gray-500">
          {(stops || []).length - located.length} adresse(s) non localisée(s) ne sont pas sur
          la carte.
        </p>
      )}
    </div>
  );
}
