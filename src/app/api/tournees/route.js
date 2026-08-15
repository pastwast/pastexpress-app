import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { geocodeAddress, nearestNeighborOrder } from '@/lib/geocode';

const FREE_LIMIT = 3;

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 });
  }

  // Le quota gratuit est vérifié ici côté serveur — c'est la seule
  // limite qui compte, l'affichage côté client n'est qu'indicatif.
  if (user.plan === 'FREE') {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const count = await prisma.tournee.count({
      where: { userId: user.id, createdAt: { gte: startOfMonth } },
    });

    if (count >= FREE_LIMIT) {
      return NextResponse.json(
        { error: 'Limite de 3 tournées gratuites atteinte ce mois-ci.' },
        { status: 403 }
      );
    }
  }

  const { addresses } = await req.json();
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return NextResponse.json({ error: 'Aucune adresse fournie.' }, { status: 400 });
  }

  const geocoded = await Promise.all(
    addresses.map(async (raw) => {
      const g = await geocodeAddress(raw);
      return { raw, ...g };
    })
  );

  const withCoords = geocoded.filter((g) => g.lat != null && g.lng != null);
  const withoutCoords = geocoded.filter((g) => g.lat == null || g.lng == null);

  const order = nearestNeighborOrder(withCoords);
  const orderedStops = order.map((i) => withCoords[i]).concat(withoutCoords);

  const tournee = await prisma.tournee.create({
    data: {
      userId: user.id,
      stops: {
        create: orderedStops.map((s, i) => ({
          rawAddress: s.raw,
          label: s.label || null,
          postalCode: s.postalCode || null,
          city: s.city || null,
          lat: s.lat ?? null,
          lng: s.lng ?? null,
          order: i,
        })),
      },
    },
    include: { stops: { orderBy: { order: 'asc' } } },
  });

  return NextResponse.json(tournee);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }

  const tournees = await prisma.tournee.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    include: { stops: { orderBy: { order: 'asc' } } },
    take: 20,
  });

  return NextResponse.json(tournees);
}
