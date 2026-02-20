type PaystackInlineConfig = {
  publicKey: string;
  email: string;
  amount: number;
  currency: string;
  reference: string;
  accessCode?: string | null;
  metadata?: Record<string, unknown>;
  onSuccess: (reference: string) => void;
  onClose?: () => void;
};

type PaystackHandler = {
  openIframe: () => void;
};

declare global {
  interface Window {
    PaystackPop?: {
      setup: (config: Record<string, unknown>) => PaystackHandler;
    };
  }
}

let paystackScriptPromise: Promise<void> | null = null;

function loadPaystackScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Paystack inline checkout is only available in the browser'));
  }

  if (window.PaystackPop) {
    return Promise.resolve();
  }

  if (paystackScriptPromise) {
    return paystackScriptPromise;
  }

  paystackScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-paystack-inline="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Paystack inline script')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    script.defer = true;
    script.dataset.paystackInline = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Paystack inline script'));
    document.head.appendChild(script);
  });

  return paystackScriptPromise;
}

export async function openPaystackInlineCheckout(config: PaystackInlineConfig): Promise<void> {
  await loadPaystackScript();

  if (!window.PaystackPop) {
    throw new Error('Paystack inline checkout is unavailable');
  }

  const handler = window.PaystackPop.setup({
    key: config.publicKey,
    email: config.email,
    amount: Math.round(config.amount),
    currency: config.currency.toUpperCase(),
    ref: config.reference,
    access_code: config.accessCode || undefined,
    metadata: config.metadata || {},
    callback: (response: { reference?: string }) => {
      const reference = String(response?.reference || config.reference || '').trim();
      config.onSuccess(reference);
    },
    onClose: () => {
      config.onClose?.();
    },
  });

  handler.openIframe();
}

