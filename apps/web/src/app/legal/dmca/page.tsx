import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DMCA Policy | FaceFind',
};

export default function DMCAPolicyPage() {
  return (
    <article className="prose prose-gray max-w-none">
      <h1>DMCA / Copyright Policy</h1>
      <p className="lead">Last updated: January 14, 2026</p>

      <h2>1. Respect for Intellectual Property</h2>
      <p>
        FaceFind respects the intellectual property rights of others and expects our users to 
        do the same. We respond to notices of alleged copyright infringement in accordance 
        with the Digital Millennium Copyright Act (DMCA).
      </p>

      <h2>2. Filing a DMCA Notice</h2>
      <p>If you believe content on FaceFind infringes your copyright, provide:</p>
      <ol>
        <li>Physical or electronic signature of the copyright owner</li>
        <li>Description of the copyrighted work claimed to be infringed</li>
        <li>Description of where the infringing material is located</li>
        <li>Your contact information (address, phone, email)</li>
        <li>Statement of good faith belief the use is not authorized</li>
        <li>Statement under penalty of perjury that the information is accurate</li>
      </ol>

      <h2>3. Submit Notices To</h2>
      <p>
        DMCA Agent<br />
        FaceFind<br />
        Email: <a href="mailto:dmca@facefind.app">dmca@facefind.app</a>
      </p>

      <h2>4. Counter-Notification</h2>
      <p>
        If you believe your content was wrongly removed, you may submit a counter-notification 
        including your contact information, identification of the removed content, and a statement 
        under penalty of perjury that you have good faith belief the content was removed in error.
      </p>

      <h2>5. Repeat Infringers</h2>
      <p>
        FaceFind will terminate accounts of users who are repeat infringers in appropriate 
        circumstances.
      </p>

      <h2>6. Good Faith</h2>
      <p>
        Please consider whether fair use or other exceptions may apply before filing a notice. 
        Misrepresentations in a DMCA notice can result in liability.
      </p>
    </article>
  );
}
