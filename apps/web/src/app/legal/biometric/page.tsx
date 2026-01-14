import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Biometric Data Policy | FaceFind',
  description: 'FaceFind Biometric Data Policy - How we handle facial recognition data',
};

export default function BiometricPolicyPage() {
  return (
    <article className="prose prose-gray max-w-none">
      <h1>Biometric Data Policy</h1>
      <p className="lead">
        Last updated: January 14, 2026
      </p>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 my-6 not-prose">
        <p className="text-amber-800 font-medium">
          ⚠️ Important: This policy describes how we collect and use biometric data (facial 
          geometry). Please read carefully before consenting.
        </p>
      </div>

      <h2>1. What Biometric Data We Collect</h2>
      <p>
        FaceFind uses facial recognition technology to match you with photos at events. We collect:
      </p>
      <ul>
        <li>
          <strong>Face Embeddings:</strong> Mathematical representations (vectors) of your 
          facial features. These are NOT photos of your face.
        </li>
        <li>
          <strong>Liveness Data:</strong> Verification that you are a real person (not a photo 
          of a photo) during face scanning.
        </li>
      </ul>

      <h2>2. Purpose of Collection</h2>
      <p>We collect biometric data solely for:</p>
      <ul>
        <li>Matching you with event photos that include your face</li>
        <li>Delivering Photo Drop notifications when new photos of you are uploaded</li>
        <li>Enabling your Photo Passport for automatic photo delivery</li>
        <li>Preventing fraud and unauthorized account access</li>
      </ul>

      <h2>3. How We Process Biometric Data</h2>
      <ol>
        <li>You take a face scan using our guided capture process (3-5 angles)</li>
        <li>Images are sent to AWS Rekognition for face detection</li>
        <li>AWS generates face embeddings (mathematical vectors)</li>
        <li>Embeddings are encrypted and stored in our secure database</li>
        <li>Original images are NOT stored after processing</li>
        <li>Embeddings are used to search for matches in event photos</li>
      </ol>

      <h2>4. Consent Requirements</h2>
      
      <h3>4.1 Explicit Consent</h3>
      <p>
        Before any biometric data collection, you must provide explicit consent by:
      </p>
      <ul>
        <li>Reading this policy</li>
        <li>Checking a consent checkbox</li>
        <li>Actively initiating the face scan process</li>
      </ul>

      <h3>4.2 Event-Specific Consent</h3>
      <p>
        For anonymous (non-registered) users, consent is granted per-event only. Your 
        biometric data is deleted when the event closes.
      </p>

      <h3>4.3 Cross-Event Consent</h3>
      <p>
        Registered users who enable Photo Passport grant consent for automatic matching 
        across all events. This can be revoked at any time.
      </p>

      <h2>5. Data Storage and Security</h2>
      <ul>
        <li><strong>Encryption:</strong> All face embeddings are encrypted with AES-256 before storage</li>
        <li><strong>Separation:</strong> Biometric data is stored separately from profile data</li>
        <li><strong>Access Control:</strong> Strict access controls; no human views your biometric data</li>
        <li><strong>No Raw Images:</strong> We do not store the photos you take during face scanning</li>
      </ul>

      <h2>6. Retention and Deletion</h2>
      
      <h3>6.1 Retention Schedule</h3>
      <table className="not-prose w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">User Type</th>
            <th className="text-left py-2">Retention Period</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-2">Anonymous (event-only)</td>
            <td className="py-2">Until event closes + 30 days</td>
          </tr>
          <tr className="border-b">
            <td className="py-2">Registered (Photo Passport)</td>
            <td className="py-2">Until consent withdrawal or account deletion</td>
          </tr>
        </tbody>
      </table>

      <h3>6.2 Deletion Process</h3>
      <p>When you delete your biometric data:</p>
      <ol>
        <li>All face embeddings are deleted from our database</li>
        <li>Deletion request sent to AWS Rekognition</li>
        <li>Deletion confirmed within 30 days</li>
        <li>You receive email confirmation</li>
      </ol>

      <h2>7. Your Rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li><strong>Access:</strong> View which events have your biometric data</li>
        <li><strong>Delete:</strong> Remove your biometric data from specific events or entirely</li>
        <li><strong>Withdraw Consent:</strong> Stop all biometric processing at any time</li>
        <li><strong>Update:</strong> Refresh your face profile with new photos</li>
      </ul>

      <h2>8. Illinois Residents (BIPA)</h2>
      <p>
        In compliance with the Illinois Biometric Information Privacy Act:
      </p>
      <ul>
        <li>We obtain written informed consent before collection</li>
        <li>We maintain this written policy publicly available</li>
        <li>We do not sell, lease, or profit from your biometric data</li>
        <li>We will permanently destroy biometric data when purpose is fulfilled or within 3 years of last interaction</li>
      </ul>

      <h2>9. Third-Party Processors</h2>
      <table className="not-prose w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">Provider</th>
            <th className="text-left py-2">Purpose</th>
            <th className="text-left py-2">Location</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-2">AWS Rekognition</td>
            <td className="py-2">Face detection and matching</td>
            <td className="py-2">United States</td>
          </tr>
          <tr className="border-b">
            <td className="py-2">Supabase</td>
            <td className="py-2">Encrypted embedding storage</td>
            <td className="py-2">United States</td>
          </tr>
        </tbody>
      </table>

      <h2>10. Contact for Biometric Inquiries</h2>
      <p>
        For questions about biometric data:<br />
        Email: <a href="mailto:biometric@facefind.app">biometric@facefind.app</a>
      </p>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 my-6 not-prose">
        <p className="text-blue-800">
          By using FaceFind's facial recognition features, you acknowledge that you have read, 
          understood, and agree to this Biometric Data Policy.
        </p>
      </div>
    </article>
  );
}
