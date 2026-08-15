'use client';
 
import { useEffect, useRef } from 'react';
 
// Leaflet est chargé depuis un CDN plutôt qu'installé en dépendance :
// pas de modification de package.json, et la carte reste optionnelle
// (si le CDN ne répond pas, le reste de la page fonctionne normalement).
function loadLeaflet() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no window'));
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
      existing.addEventListener('error', () => reject(new Error('leaflet failed')));
      return;
    }
 
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.setAttribute('data-leaflet', 'true');
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('leaflet failed'));
    document.head.appendChild(script);
  });
}
 
export default function TourneeMap({ stops }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
 
  useEffect(() => {
    let cancelled = false;
 
    const located = (stops || []).filter((s) => s.lat != null && s.lng != null);
    if (located.length === 0) return;
 
    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current) return;
 
        // Une nouvelle tournée remplace entièrement la carte précédente.
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
 
        const map = L.map(containerRef.current, {
          scrollWheelZoom: false,
        });
        mapRef.current = map;
 
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap',
        }).addTo(map);
 
        const latlngs = located.map((s) => [s.lat, s.lng]);
 
        // Trait reliant les arrêts dans l'ordre de la tournée
        L.polyline(latlngs, {
          color: '#1B2A4A',
          weight: 3,
          opacity: 0.6,
        }).addTo(map);
 
        located.forEach((s, i) => {
          const icon = L.divIcon({
            className: '',
            html: `<div style="
              background:#B23A2C;
              color:#fff;
              width:26px;height:26px;
              border-radius:50%;
              display:flex;align-items:center;justify-content:center;
              font-size:12px;font-weight:700;
              border:2px solid #fff;
              box-shadow:0 1px 4px rgba(0,0,0,.4);
            ">${i + 1}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          });
 
          L.marker([s.lat, s.lng], { icon })
            .addTo(map)
            .bindPopup(`<strong>${i + 1}.</strong> ${s.label || s.rawAddress}`);
        });
 
        map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] });
      })
      .catch(() => {
        // Carte indisponible : la liste d'adresses reste utilisable.
      });
 
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [stops]);
 
  const located = (stops || []).filter((s) => s.lat != null && s.lng != null);
  if (located.length === 0) return null;
 
  return (
    <div className="mb-4">
      <div
        ref={containerRef}
        className="h-72 w-full rounded border border-gray-200"
        style={{ zIndex: 0 }}
      />
      {located.length < (stops || []).length && (
        <p className="mt-1 text-xs text-gray-500">
          {(stops || []).length - located.length} adresse(s) non localisée(s) ne sont pas
          affichée(s) sur la carte.
        </p>
      )}
    </div>
  );
}
