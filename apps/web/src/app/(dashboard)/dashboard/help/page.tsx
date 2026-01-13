import { HelpCircle, Book, MessageCircle, Mail, ExternalLink, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

const faqs = [
  {
    question: 'How does face recognition work?',
    answer: 'Our AI analyzes facial features to create a unique signature. When attendees scan their face, we match it against photos from the event to find all images featuring them.',
  },
  {
    question: 'Is my biometric data secure?',
    answer: 'Yes! All facial data is encrypted, event-scoped, and automatically deleted after the event retention period. We never share biometric data with third parties.',
  },
  {
    question: 'How do I get paid for photo sales?',
    answer: 'Connect your Stripe account in the Billing section. When attendees purchase photos, funds are transferred directly to your account minus platform fees.',
  },
  {
    question: 'What file formats are supported?',
    answer: 'We support JPEG, PNG, and WebP images. Maximum file size is 50MB per photo. RAW files should be converted before uploading.',
  },
  {
    question: 'Can attendees find photos without creating an account?',
    answer: 'Yes! Attendees can scan their face directly at the event page. They only need an account to save their FaceTag for future events.',
  },
];

const resources = [
  {
    title: 'Getting Started Guide',
    description: 'Learn the basics of setting up your first event',
    icon: Book,
    href: '#',
  },
  {
    title: 'Pricing & Plans',
    description: 'Compare features and find the right plan',
    icon: HelpCircle,
    href: '/dashboard/billing',
  },
  {
    title: 'Community Forum',
    description: 'Connect with other photographers',
    icon: MessageCircle,
    href: '#',
  },
];

export default function HelpPage() {
  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Help & Support</h1>
        <p className="mt-1 text-secondary">
          Find answers to common questions or reach out to our team.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-3">
        {resources.map((resource) => (
          <Link
            key={resource.title}
            href={resource.href}
            className="group rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:shadow-soft hover:border-accent/20"
          >
            <div className="rounded-xl bg-accent/10 p-3 w-fit">
              <resource.icon className="h-6 w-6 text-accent" />
            </div>
            <h3 className="mt-4 font-semibold text-foreground group-hover:text-accent transition-colors">
              {resource.title}
            </h3>
            <p className="mt-1 text-sm text-secondary">
              {resource.description}
            </p>
          </Link>
        ))}
      </div>

      {/* FAQs */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-semibold text-foreground">Frequently Asked Questions</h2>
        </div>
        <div className="divide-y divide-border">
          {faqs.map((faq, index) => (
            <details key={index} className="group">
              <summary className="flex items-center justify-between px-6 py-4 cursor-pointer list-none">
                <span className="font-medium text-foreground">{faq.question}</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-open:rotate-90" />
              </summary>
              <div className="px-6 pb-4">
                <p className="text-secondary">{faq.answer}</p>
              </div>
            </details>
          ))}
        </div>
      </div>

      {/* Contact Support */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-accent/10 p-3">
            <Mail className="h-6 w-6 text-accent" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-foreground">Still need help?</h2>
            <p className="mt-1 text-sm text-secondary">
              Our support team is available Monday through Friday, 9am to 5pm EST.
            </p>
            <div className="mt-4 flex gap-3">
              <Button variant="primary">
                <Mail className="h-4 w-4" />
                Contact Support
              </Button>
              <Button variant="outline">
                <ExternalLink className="h-4 w-4" />
                Documentation
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
