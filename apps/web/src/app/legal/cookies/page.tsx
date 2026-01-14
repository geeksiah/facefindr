import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cookie Policy | FaceFind',
};

export default function CookiePolicyPage() {
  return (
    <article className="prose prose-gray max-w-none">
      <h1>Cookie Policy</h1>
      <p className="lead">Last updated: January 14, 2026</p>

      <h2>1. What Are Cookies</h2>
      <p>Cookies are small text files stored on your device when you visit websites.</p>

      <h2>2. Cookies We Use</h2>
      
      <h3>Essential Cookies</h3>
      <p>Required for the service to function:</p>
      <ul>
        <li><code>sb-access-token</code> - Authentication session</li>
        <li><code>sb-refresh-token</code> - Session refresh</li>
      </ul>

      <h3>Analytics Cookies</h3>
      <p>Help us understand how visitors use our site (with consent):</p>
      <ul>
        <li>Page views and navigation</li>
        <li>Feature usage</li>
        <li>Error tracking</li>
      </ul>

      <h3>Preference Cookies</h3>
      <ul>
        <li>Theme preference (light/dark)</li>
        <li>Language selection</li>
      </ul>

      <h2>3. Managing Cookies</h2>
      <p>You can control cookies through your browser settings. Note that disabling essential cookies will prevent login.</p>

      <h2>4. Third-Party Cookies</h2>
      <ul>
        <li><strong>Stripe:</strong> Payment processing</li>
        <li><strong>Vercel Analytics:</strong> Performance monitoring</li>
      </ul>

      <h2>5. Contact</h2>
      <p>Email: <a href="mailto:privacy@facefind.app">privacy@facefind.app</a></p>
    </article>
  );
}
