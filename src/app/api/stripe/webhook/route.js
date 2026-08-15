import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

// Le corps brut (non parsé en JSON) est nécessaire pour vérifier la signature Stripe.
export async function POST(req) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json({ error: `Webhook invalide: ${err.message}` }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const checkoutSession = event.data.object;
      await prisma.user.updateMany({
        where: { stripeCustomerId: checkoutSession.customer },
        data: { plan: 'PRO', stripeSubscriptionId: checkoutSession.subscription },
      });
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const isActive = ['active', 'trialing'].includes(subscription.status);
      await prisma.user.updateMany({
        where: { stripeCustomerId: subscription.customer },
        data: { plan: isActive ? 'PRO' : 'FREE' },
      });
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
