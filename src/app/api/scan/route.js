import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
 
// Extraction des adresses depuis une photo de feuille de tournée.
// Réservé aux abonnés Pro : chaque scan a un coût réel côté API.
export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }
 
  // Le plan est relu en base : c'est la seule vérification qui compte,
  // l'affichage côté navigateur peut être contourné.
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 });
  }
  if (user.plan !== 'PRO') {
    return NextResponse.json(
      { error: 'Le scan photo est réservé au plan Pro.' },
      { status: 403 }
    );
  }
 
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Le scan n'est pas configuré sur ce serveur." },
      { status: 500 }
    );
  }
 
  const { imageBase64, mediaType } = await req.json();
  if (!imageBase64) {
    return NextResponse.json({ error: 'Aucune image reçue.' }, { status: 400 });
  }
 
  const prompt = `Cette image est une feuille de tournée de livraison (imprimée ou manuscrite).
 
Extrais UNIQUEMENT les adresses de livraison des clients.
 
Règles :
- Une adresse par entrée, la plus complète possible (numéro, rue, code postal, ville).
- Ignore les en-têtes, numéros de commande, noms de clients, téléphones, totaux, mentions du transporteur.
- Si une adresse est partiellement illisible, inclus-la telle que tu la lis, sans inventer.
- Ne complète jamais un code postal ou une ville que tu ne vois pas.
 
Réponds EXCLUSIVEMENT avec un tableau JSON de chaînes, sans texte autour, sans balises markdown.
Exemple exact du format attendu :
["12 rue des Lilas, 75011 Paris","4 avenue Foch, 75116 Paris"]
 
Si aucune adresse n'est lisible, réponds : []`;
 
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType || 'image/jpeg',
                  data: imageBase64,
                },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });
 
    if (!response.ok) {
      const detail = await response.text();
      console.error('Erreur API Anthropic:', detail);
      return NextResponse.json(
        { error: "La lecture de l'image a échoué. Réessaie avec une photo plus nette." },
        { status: 502 }
      );
    }
 
    const data = await response.json();
    const text = (data.content || [])
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();
 
    // Le modèle peut parfois encadrer sa réponse de balises markdown : on nettoie.
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
 
    let addresses;
    try {
      addresses = JSON.parse(cleaned);
    } catch (e) {
      console.error('Réponse non parsable:', cleaned);
      return NextResponse.json(
        { error: "Aucune adresse n'a pu être lue sur cette photo." },
        { status: 422 }
      );
    }
 
    if (!Array.isArray(addresses)) {
      return NextResponse.json(
        { error: "Aucune adresse n'a pu être lue sur cette photo." },
        { status: 422 }
      );
    }
 
    const clean = addresses
      .filter((a) => typeof a === 'string' && a.trim().length > 0)
      .map((a) => a.trim());
 
    return NextResponse.json({ addresses: clean });
  } catch (err) {
    console.error('Erreur scan:', err);
    return NextResponse.json({ error: 'Erreur pendant la lecture.' }, { status: 500 });
  }
}
