import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | FaceFind',
  description: 'FaceFind Privacy Policy - How we collect, use, and protect your data',
};

export default function PrivacyPolicyPage() {
  return (
    <article className="prose prose-gray max-w-none">
      <h1>Privacy Policy</h1>
      <p className="lead">
        Last updated: January 14, 2026
      </p>

      <p>
        FaceFind ("we," "our," or "us") is committed to protecting your privacy. This Privacy 
        Policy explains how we collect, use, disclose, and safeguard your information when you 
        use our facial recognition photo delivery platform.
      </p>

      <h2>1. Information We Collect</h2>
      
      <h3>1.1 Information You Provide</h3>
      <ul>
        <li><strong>Account Information:</strong> Name, email address, password, and profile photo</li>
        <li><strong>FaceTag:</strong> Your unique identifier for photo matching</li>
        <li><strong>Payment Information:</strong> Processed securely by Stripe; we do not store card details</li>
        <li><strong>Communications:</strong> Messages you send us</li>
      </ul>

      <h3>1.2 Biometric Information</h3>
      <p>
        With your explicit consent, we collect facial geometry data ("face embeddings") to match 
        you with photos. See our <a href="/legal/biometric">Biometric Data Policy</a> for details.
      </p>

      <h3>1.3 Automatically Collected Information</h3>
      <ul>
        <li>Device information (type, operating system)</li>
        <li>IP address and location (country/region)</li>
        <li>Usage data (features used, time spent)</li>
        <li>Cookies and similar technologies</li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <ul>
        <li>Provide, maintain, and improve our services</li>
        <li>Match you with event photos using facial recognition</li>
        <li>Process payments and deliver purchased photos</li>
        <li>Send notifications about new photo matches</li>
        <li>Communicate with you about your account</li>
        <li>Detect and prevent fraud</li>
        <li>Comply with legal obligations</li>
      </ul>

      <h2>3. Information Sharing</h2>
      <p>We do not sell your personal information. We may share information with:</p>
      <ul>
        <li><strong>Service Providers:</strong> AWS (facial recognition), Stripe (payments), Vercel (hosting)</li>
        <li><strong>Creators:</strong> Anonymous aggregate statistics only; never individual identification</li>
        <li><strong>Legal Requirements:</strong> When required by law or to protect rights</li>
      </ul>

      <h2>4. Data Retention</h2>
      <ul>
        <li><strong>Account Data:</strong> Until you delete your account</li>
        <li><strong>Face Embeddings:</strong> Until you withdraw consent or delete account</li>
        <li><strong>Event-Scoped Data:</strong> Per event retention policy (30-365 days based on plan)</li>
        <li><strong>Audit Logs:</strong> 2 years minimum</li>
      </ul>

      <h2>5. Your Rights</h2>
      
      <h3>5.1 All Users</h3>
      <ul>
        <li>Access your personal data</li>
        <li>Correct inaccurate data</li>
        <li>Delete your account and data</li>
        <li>Export your data</li>
        <li>Withdraw consent for biometric processing</li>
      </ul>

      <h3>5.2 EU/EEA Residents (GDPR)</h3>
      <ul>
        <li>Right to data portability</li>
        <li>Right to restrict processing</li>
        <li>Right to object to processing</li>
        <li>Right to lodge a complaint with supervisory authority</li>
      </ul>

      <h3>5.3 California Residents (CCPA)</h3>
      <ul>
        <li>Right to know what data is collected</li>
        <li>Right to deletion</li>
        <li>Right to opt-out of sale (we do not sell data)</li>
        <li>Right to non-discrimination</li>
      </ul>

      <h2>6. Security</h2>
      <p>
        We implement industry-standard security measures including:
      </p>
      <ul>
        <li>Encryption in transit (TLS 1.2+) and at rest (AES-256)</li>
        <li>Face embeddings encrypted before storage</li>
        <li>Row-level security at database level</li>
        <li>Regular security audits</li>
      </ul>

      <h2>7. International Transfers</h2>
      <p>
        Your data may be processed in the United States. We use Standard Contractual Clauses 
        and other safeguards for international transfers.
      </p>

      <h2>8. Children's Privacy</h2>
      <p>
        Users under 13 may use our services with parental consent. We implement additional 
        protections for minor users, including more frequent face profile refresh requirements.
      </p>

      <h2>9. Changes to This Policy</h2>
      <p>
        We will notify you of material changes via email or in-app notification at least 30 
        days before they take effect.
      </p>

      <h2>10. Contact Us</h2>
      <p>
        For privacy inquiries:<br />
        Email: <a href="mailto:privacy@facefind.app">privacy@facefind.app</a><br />
        Data Protection Officer: <a href="mailto:dpo@facefind.app">dpo@facefind.app</a>
      </p>
    </article>
  );
}
