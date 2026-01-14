import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Use for Attendees | FaceFind',
};

export default function TermsAttendeesPage() {
  return (
    <article className="prose prose-gray max-w-none">
      <h1>Terms of Use for Attendees</h1>
      <p className="lead">Last updated: January 14, 2026</p>

      <h2>1. Acceptance of Terms</h2>
      <p>By using FaceFind to find your event photos, you agree to these Terms of Use.</p>

      <h2>2. Account Types</h2>
      <ul>
        <li><strong>Anonymous Access:</strong> Access individual events without an account</li>
        <li><strong>Registered Account:</strong> Create an account for Photo Passport and cross-event access</li>
      </ul>

      <h2>3. FaceTag and Photo Passport</h2>
      <ul>
        <li>Your FaceTag is your unique identifier (e.g., @username1234)</li>
        <li>Photo Passport enables automatic photo delivery</li>
        <li>You can share your FaceTag; no personal data is transmitted</li>
      </ul>

      <h2>4. Biometric Consent</h2>
      <p>Using face scanning features requires consent to our <a href="/legal/biometric">Biometric Data Policy</a>.</p>

      <h2>5. Photo Access and Purchases</h2>
      <ul>
        <li>Free events: Download photos at no cost</li>
        <li>Paid events: Purchase individual photos or unlock-all bundles</li>
        <li>Payments processed securely via Stripe</li>
        <li>Digital downloads available immediately after purchase</li>
      </ul>

      <h2>6. Your Rights</h2>
      <ul>
        <li>View photos where your face was detected</li>
        <li>Delete your face data from specific events</li>
        <li>Export your data</li>
        <li>Delete your account</li>
      </ul>

      <h2>7. Prohibited Activities</h2>
      <ul>
        <li>Sharing purchased photos commercially without permission</li>
        <li>Attempting to access others' photos</li>
        <li>Using automated tools to access the service</li>
      </ul>

      <h2>8. Privacy</h2>
      <p>See our <a href="/legal/privacy">Privacy Policy</a> for how we handle your data.</p>

      <h2>9. Contact</h2>
      <p>Email: <a href="mailto:support@facefind.app">support@facefind.app</a></p>
    </article>
  );
}
