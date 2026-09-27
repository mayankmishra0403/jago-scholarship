import { SectionCard } from '@/components/bits.tsx'

export const Accessibility = () => (
  <SectionCard title="Accessibility statement">
    <div className="space-y-3 text-sm text-ink-700">
      <p>
        This prototype is designed to meet the needs of users across devices and bandwidths. The
        fonts are loaded with <code>font-display: swap</code>, the interface uses large tap targets
        (at least 44 × 44 CSS pixels on touch), supports high-contrast focus rings, responds to
        <code> prefers-reduced-motion</code>, and carries a keyboard-accessible skip link.
      </p>
      <p>
        Images are used decoratively wherever possible and marked <code>aria-hidden</code> when they
        do not convey meaning. Live announcements use <code>aria-live</code> for the JAGO assistant
        and toast notifications.
      </p>
      <p>
        If you have feedback about accessibility for this prototype, email the development team or
        raise an issue via your submission channel. This is an evolving build and improvements
        will be incorporated as they are identified.
      </p>
    </div>
  </SectionCard>
)

export const Privacy = () => (
  <SectionCard title="Privacy policy">
    <div className="space-y-3 text-sm text-ink-700">
      <p>
        The prototype uses only a publishable Supabase key (no service role). All reads are
        constrained by Row Level Security, and data access is read-mostly against aggregate or
        demo records.
      </p>
      <p>
        Local storage is used only to preserve the selected language, role, profile, and simulator
        state for your current browser session. No personal data is sent to third-party analytics
        in this build. Network requests are limited to Supabase (for the read-only views) and the
        Google Fonts CDN (for the script fonts).
      </p>
      <p>
        Government connectors shown here are mocked, so no real credentials or application data
        leaves this prototype for external government systems.
      </p>
    </div>
  </SectionCard>
)

export const Terms = () => (
  <SectionCard title="Terms of use">
    <div className="space-y-3 text-sm text-ink-700">
      <p>
        This is an educational prototype created for Smart India Hackathon problem statement 26238.
        It is provided "as is" for demonstration and evaluation purposes only. Do not submit real
        applications through this interface — use the National Scholarship Portal (
        <a href="https://scholarships.gov.in" className="underline" rel="noreferrer noopener" target="_blank">
          scholarships.gov.in
        </a>
        ).
      </p>
      <p>
        The rules, counts and connector responses are illustrative. Eligibility results shown here
        do not constitute a decision of the Ministry of Tribal Affairs or any state authority.
      </p>
    </div>
  </SectionCard>
)

export const Help = () => (
  <SectionCard title="Help">
    <div className="space-y-3 text-sm text-ink-700">
      <p>
        <strong>Quick start:</strong> Open Schemes to see the reason for each verdict first, then
        use the Simulator to prove an outage never becomes a pass. Use the Language picker to try
        one of the assistant-tier tribal languages.
      </p>
      <p>
        <strong>Troubleshooting:</strong> If the app falls back to "offline, using local demo data",
        that means it could not reach Supabase on first load — the eligibility engine still runs
        against the same rules in your browser.
      </p>
      <p>
        <strong>Known limits:</strong> District-level coverage cohorts require a staff session by
        design (RLS). The government connectors are deterministic mocks.
      </p>
    </div>
  </SectionCard>
)
