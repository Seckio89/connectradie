---
name: escrow-flow
description: ConnecTradie's escrow payment flow using Stripe Connect with manual capture. Covers hold, release, refund, disputes, and the payments database schema.
---

# Escrow Flow

## Lifecycle
Homeowner pays → Funds held (manual capture) → Tradie completes → Homeowner approves → Released to Connect account

## Status: pending → held → released → completed (or disputed/refunded/expired)

## PaymentIntent Config
- capture_method: 'manual'
- currency: 'aud'
- transfer_data.destination: tradie Connect account
- application_fee_amount: 10% platform fee
- metadata: job_id, homeowner_id, tradie_id

## Release: stripe.paymentIntents.capture(id) → update DB → notify tradie
## Refund: stripe.refunds.create({ payment_intent: id }) → update DB

## Webhooks: payment_intent.succeeded → held, payment_failed → notify, canceled → refunded, charge.dispute.created → flag

## Edge cases: 48hr dispute window, 7-day auto-refund for no-show, queue if Connect not ready
