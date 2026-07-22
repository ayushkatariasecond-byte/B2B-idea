'use client';

import { useState } from 'react';
import { submitInquiry } from '@/lib/api';

export function InquiryForm({ agencyId, agencyName }: { agencyId: string; agencyName: string }) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('submitting');
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      await submitInquiry({
        agencyId,
        name: String(form.get('name') || ''),
        email: String(form.get('email') || ''),
        company: String(form.get('company') || '') || undefined,
        message: String(form.get('message') || ''),
        budget: String(form.get('budget') || '') || undefined,
      });
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    }
  }

  if (status === 'sent') {
    return (
      <div className="inquiry-card">
        <h3>Sent</h3>
        <p>{agencyName} will get back to you at the email you provided.</p>
      </div>
    );
  }

  return (
    <div className="inquiry-card">
      <h3>Contact {agencyName}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="name">Your name</label>
          <input id="name" name="name" type="text" required />
        </div>
        <div className="form-field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required />
        </div>
        <div className="form-field">
          <label htmlFor="company">Company (optional)</label>
          <input id="company" name="company" type="text" />
        </div>
        <div className="form-field">
          <label htmlFor="budget">Project budget (optional)</label>
          <input id="budget" name="budget" type="text" placeholder="$5k–$10k/mo" />
        </div>
        <div className="form-field">
          <label htmlFor="message">What do you need help with?</label>
          <textarea id="message" name="message" rows={4} required />
        </div>
        {status === 'error' && <p style={{ color: '#c0392b', fontSize: 13 }}>{error}</p>}
        <button className="button" type="submit" disabled={status === 'submitting'} style={{ width: '100%' }}>
          {status === 'submitting' ? 'Sending…' : 'Send inquiry'}
        </button>
      </form>
    </div>
  );
}
