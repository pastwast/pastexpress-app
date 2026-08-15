// Géocodage via l'API Adresse du gouvernement français (gratuite, sans clé).
// Ne fonctionne que pour des adresses en France. Doc: https://adresse.data.gouv.fr/api-doc/adresse
const BAN_URL = 'https://api-adresse.data.gouv.fr/search/';

export async function geocodeAddress(rawAddress) {
  try {
    const url = `${BAN_URL}?q=${encodeURIComponent(rawAddress)}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const feature = data.features?.[0];
    if (!feature) return null;

    const [lng, lat] = feature.geometry.coordinates;
    const props = feature.properties;

    return {
      lat,
      lng,
      label: props.label,
      postalCode: props.postcode,
      city: props.city,
    };
  } catch (err) {
    // Adresse illisible par l'API, ou API injoignable: on continue sans coordonnées
    return null;
  }
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

// Heuristique "plus proche voisin": part du premier point, puis va toujours
// vers l'arrêt non visité le plus proche. Ce n'est pas la tournée optimale
// parfaite (problème NP-difficile), mais donne un très bon ordre de passage
// pour un usage réel, sans dépendre d'une API de routing payante.
export function nearestNeighborOrder(points) {
  if (points.length <= 1) return points.map((_, i) => i);

  const remaining = points.map((p, i) => ({ ...p, _idx: i }));
  const ordered = [];
  let current = remaining.shift();
  ordered.push(current);

  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((p, i) => {
      const d = haversineKm(current, p);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    current = remaining.splice(bestIdx, 1)[0];
    ordered.push(current);
  }

  return ordered.map((p) => p._idx);
}
