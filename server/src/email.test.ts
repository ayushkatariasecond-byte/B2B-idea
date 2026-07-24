import { escapeHtml } from './email';

describe('escapeHtml', () => {
  it('encodes every HTML-significant character', () => {
    expect(escapeHtml(`<script>alert('x')</script> & "quotes"`)).toBe(
      '&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; &quot;quotes&quot;'
    );
  });

  it('closes off a business/team name crafted to break out of its <b> tag', () => {
    const malicious = '</b><img src=x onerror=alert(1)><b>';
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain('<img');
    expect(escaped).not.toContain('</b>');
    expect(escaped).toBe('&lt;/b&gt;&lt;img src=x onerror=alert(1)&gt;&lt;b&gt;');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml("Franklin's Firehouse BBQ")).toBe('Franklin&#39;s Firehouse BBQ');
  });
});
