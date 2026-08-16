'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    // L'échec d'enregistrement ne doit jamais bloquer l'application :
    // le hors-ligne est un confort, pas une condition de fonctionnement.
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  return null;
}
