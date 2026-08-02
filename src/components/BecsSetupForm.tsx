import { useState } from 'react';
import { Elements, AuBankAccountElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Loader2, Building2, Shield } from 'lucide-react';
import { stripePromise } from '../lib/stripe';

interface BecsFormInnerProps {
  clientSecret: string;
  name: string;
  email: string;
  onSuccess: () => void;
  onCancel: () => void;
}

function BecsFormInner({ clientSecret, name, email, onSuccess, onCancel }: BecsFormInnerProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError(null);

    const auBankAccountElement = elements.getElement(AuBankAccountElement);
    if (!auBankAccountElement) {
      setError('Bank account form not loaded');
      setLoading(false);
      return;
    }

    const { error: confirmError } = await stripe.confirmAuBecsDebitSetup(clientSecret, {
      payment_method: {
        au_becs_debit: auBankAccountElement,
        billing_details: { name, email },
      },
    });

    if (confirmError) {
      setError(confirmError.message || 'Failed to set up direct debit');
      setLoading(false);
    } else {
      // Keep loading state visible while parent refreshes payment methods
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-ct-mute-2 mb-2">Bank Account Details</label>
        <div className="border border-ct-line rounded-ct-sm p-3.5 bg-ct-surface focus-within:border-ct-line focus-within:ring-1 focus-within:ring-ct-teal transition-colors">
          <AuBankAccountElement
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#F3F6F5', // --paper: literals required, Stripe iframe can't read CSS vars
                  '::placeholder': { color: '#6B807B' }, // --placeholder
                },
              },
            }}
          />
        </div>
      </div>

      {/* Mandatory BECS Direct Debit agreement text */}
      <div className="bg-ct-surface-2 border border-ct-line rounded-ct-sm p-3.5">
        <div className="flex items-start gap-2">
          <Shield className="w-4 h-4 text-ct-mute-2 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-ct-mute-2 leading-relaxed">
            By providing your bank account details and confirming this payment, you agree to this
            Direct Debit Request and the{' '}
            <a
              href="https://stripe.com/au-becs-dd-service-agreement/legal"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ct-mute-2 underline"
            >
              Direct Debit Request service agreement
            </a>
            , and authorise Stripe Payments Australia Pty Ltd ACN 160 180 343 Direct Debit User ID
            number 507156 (&quot;Stripe&quot;) to debit your account through the Bulk Electronic
            Clearing System (BECS) on behalf of ConnecTradie for any amounts separately
            communicated to you.
          </p>
        </div>
      </div>

      {error && (
        <p className="text-sm text-ct-rose">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!stripe || loading}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-ct-teal text-ct-ink rounded-ct-sm hover:brightness-110 disabled:opacity-50 text-sm font-medium transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Setting up...
            </>
          ) : (
            <>
              <Building2 className="w-4 h-4" />
              Authorise direct debit
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2.5 text-sm font-medium text-ct-mute-2 hover:text-ct-paper transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

interface BecsSetupFormProps {
  clientSecret: string;
  name: string;
  email: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function BecsSetupForm({ clientSecret, name, email, onSuccess, onCancel }: BecsSetupFormProps) {
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <BecsFormInner
        clientSecret={clientSecret}
        name={name}
        email={email}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    </Elements>
  );
}
