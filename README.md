# PasteExpress

SaaS pour trier des tournées de livraison par adresse. Next.js 14 (App Router) +
Prisma/Postgres + NextAuth (email/mot de passe) + Stripe (abonnement 9,90€/mois,
3 tournées gratuites/mois).

Le tri utilise l'API Adresse du gouvernement français (gratuite, sans clé) pour
géocoder, puis un algorithme du plus proche voisin pour ordonner les arrêts.
**Fonctionne uniquement pour des adresses françaises.**

Ce code n'a pas été exécuté dans l'environnement où il a été généré (pas d'accès
réseau pour lancer `npm install`). Il suit les conventions standard de Next.js 14 /
NextAuth v4 / Stripe, mais teste-le en local avant de déployer — dis-moi si tu
rencontres une erreur.

## 1. Prérequis

- Node.js 18+
- Un compte Stripe (mode test pour commencer) : https://dashboard.stripe.com
- Une base Postgres gratuite, ex. https://neon.tech ou https://supabase.com

## 2. Installation locale

```bash
npm install
cp .env.example .env
```

Remplis `.env` :
- `DATABASE_URL` : l'URL de connexion Postgres fournie par Neon/Supabase
- `NEXTAUTH_SECRET` : génère avec `openssl rand -base64 32`
- `STRIPE_SECRET_KEY` : dans dashboard.stripe.com/test/apikeys
- `STRIPE_PRICE_ID_PRO` : voir étape 3
- `STRIPE_WEBHOOK_SECRET` : voir étape 4

Puis crée les tables :

```bash
npx prisma migrate dev --name init
```

## 3. Créer le prix Stripe

Dans le dashboard Stripe (mode test) : Produits → Ajouter un produit
→ "PasteExpress Pro", tarification récurrente, 9,90€/mois.
Copie l'ID du prix (`price_...`) dans `STRIPE_PRICE_ID_PRO`.

## 4. Webhook Stripe en local

Installe la CLI Stripe (https://stripe.com/docs/stripe-cli), puis :

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copie le `whsec_...` affiché dans `STRIPE_WEBHOOK_SECRET`.

## 5. Lancer le site

```bash
npm run dev
```

→ http://localhost:3000. Inscris-toi, colle des adresses, génère une tournée.
Pour tester le paiement, utilise la carte de test Stripe `4242 4242 4242 4242`,
n'importe quelle date future et n'importe quel CVC.

## 6. Déploiement (Vercel)

1. Pousse le projet sur GitHub, importe-le sur https://vercel.com
2. Ajoute les mêmes variables d'environnement dans Vercel (Settings → Environment
   Variables), avec `NEXTAUTH_URL` = ton domaine de production
3. Passe Stripe en mode live, recrée le produit/prix en mode live, mets à jour
   `STRIPE_SECRET_KEY` et `STRIPE_PRICE_ID_PRO`
4. Dans le dashboard Stripe → Webhooks, ajoute un endpoint
   `https://tondomaine.com/api/stripe/webhook`, coche `checkout.session.completed`,
   `customer.subscription.updated`, `customer.subscription.deleted`, copie le
   nouveau `whsec_...` dans les variables Vercel
5. Après le premier déploiement, exécute `npx prisma migrate deploy` (en local
   avec le `DATABASE_URL` de prod, ou via un script de build Vercel)

## Limites connues / prochaines étapes

- Pas de portail Stripe pour que l'utilisateur annule/change de carte lui-même
  (à ajouter : `stripe.billingPortal.sessions.create`)
- Pas de réinitialisation de mot de passe
- Le tri "plus proche voisin" est une bonne heuristique, pas un optimum garanti ;
  il ne tient pas compte du sens des rues ou des créneaux horaires
- Protection de `/dashboard` faite côté client (redirection si non connecté) —
  suffisant pour un MVP, pas pour une app à fort enjeu de sécurité
