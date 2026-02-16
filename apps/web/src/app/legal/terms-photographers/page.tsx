import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service for Creators | FaceFind',
};

export default function TermsCreatorsPage() {
  return (
    <article className="prose prose-gray max-w-none">
      <h1>Terms of Service for Creators</h1>
      <p className="lead">Last updated: January 14, 2026</p>

      <h2>1. Acceptance of Terms</h2>
      <p>By creating a photographer account on FaceFind, you agree to these Terms of Service.</p>

      <h2>2. Account Registration</h2>
      <ul>
        <li>You must be 18 years or older</li>
        <li>Provide accurate registration information</li>
        <li>Maintain the security of your account credentials</li>
        <li>Notify us immediately of unauthorized access</li>
      </ul>

      <h2>3. Subscription Plans</h2>
      <p>FaceFind offers the following subscription tiers:</p>
      <ul>
        <li><strong>Starter:</strong> $15/month - 1,000 photos/event, 5 active events</li>
        <li><strong>Pro:</strong> $39/month - 5,000 photos/event, 20 active events</li>
        <li><strong>Studio:</strong> $99/month - 20,000 photos/event, unlimited events</li>
      </ul>

      <h2>4. Payment Terms</h2>
      <ul>
        <li>Subscriptions are billed monthly or annually in advance</li>
        <li>Payments processed securely via Stripe</li>
        <li>Automatic renewal unless cancelled</li>
        <li>No refunds for partial months</li>
      </ul>

      <h2>5. Content Ownership</h2>
      <ul>
        <li>You retain ownership of photos you upload</li>
        <li>You grant FaceFind license to process and display photos</li>
        <li>You warrant you have rights to all uploaded content</li>
      </ul>

      <h2>6. Platform Fees</h2>
      <table className="not-prose w-full text-sm">
        <thead><tr className="border-b"><th className="text-left py-2">Plan</th><th className="text-left py-2">Platform Fee</th></tr></thead>
        <tbody>
          <tr className="border-b"><td className="py-2">Starter</td><td className="py-2">20%</td></tr>
          <tr className="border-b"><td className="py-2">Pro</td><td className="py-2">15%</td></tr>
          <tr className="border-b"><td className="py-2">Studio</td><td className="py-2">10%</td></tr>
        </tbody>
      </table>

      <h2>7. Payouts</h2>
      <ul>
        <li>Payouts via Stripe Connect (bank or debit card)</li>
        <li>Minimum payout threshold: $10</li>
        <li>Standard 2-day rolling payout schedule</li>
      </ul>

      <h2>8. Prohibited Content</h2>
      <p>You may not upload content that is illegal, harmful, or violates third-party rights.</p>

      <h2>9. Termination</h2>
      <p>We may suspend or terminate accounts for Terms violations with notice when possible.</p>

      <h2>10. Contact</h2>
      <p>Email: <a href="mailto:support@facefind.app">support@facefind.app</a></p>
    </article>
  );
}
