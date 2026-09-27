import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  DEMO_APPLICATIONS,
  DEMO_DOCUMENTS,
  DEMO_PROFILE,
  evaluateScheme,
} from '@shared/demo.ts'
import { isUiLanguage, t } from '@shared/i18n.ts'
import type { EligibilityRun } from '@shared/demo.ts'
import { hydrateDemoState } from '@/data/repository.ts'
import { auth, supabase, type AuthSession } from '@/lib/supabase.ts'
import type {
  Application,
  LanguageCode,
  Role,
  StudentDocument,
  StudentProfile,
  VerificationCheck,
  VerificationSource,
} from '@shared/types.ts'

/**
 * Single source of truth for the demo.
 *
 * The store starts from the deterministic demo persona and then hydrates from
 * Supabase when it is reachable, so the SIH demo works with no network while
 * still being a real client of the real database.
 */

export interface Toast {
  id: string
  tone: 'info' | 'success' | 'warn' | 'error'
  title: string
  body?: string
}

interface AppState {
  /**
   * The real signed-in session, or null when anonymous. Null is the honest
   * default: it is what makes RLS deny staff tables, and it is what the
   * `isStaff` gate in App.tsx keys off.
   */
  session: AuthSession | null
  /** Role read from `profiles`, not from the local switcher. */
  profileRole: Role
  /** True only for a live session whose profile role is staff. */
  isStaff: boolean
  setSession: (s: AuthSession | null) => void
  signOut: () => Promise<void>
  role: Role
  setRole: (r: Role) => void
  language: LanguageCode
  setLanguage: (l: LanguageCode) => void

  profile: StudentProfile
  updateProfile: (patch: Partial<StudentProfile>) => void

  documents: StudentDocument[]
  upsertDocument: (doc: StudentDocument) => void
  removeDocument: (id: string) => void

  applications: Application[]
  addApplication: (a: Application) => void
  setApplicationStatus: (id: string, status: Application['status']) => void

  /** schemeCode → latest verification run. */
  runs: Record<string, EligibilityRun>
  runChecks: (schemeCodes: string[]) => Promise<void>
  checking: boolean

  simulateFailure: VerificationSource[]
  toggleSimulator: (source: VerificationSource) => void

  toasts: Toast[]
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void

  hydrated: boolean
  live: boolean
}

const Ctx = createContext<AppState | null>(null)

const STORAGE_KEY = 'jago.state.v1'

interface Persisted {
  role: Role
  language: LanguageCode
  profile: StudentProfile
  documents: StudentDocument[]
  applications: Application[]
  simulateFailure: VerificationSource[]
}

const readPersisted = (): Partial<Persisted> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {}
  } catch {
    return {}
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const saved = useMemo(readPersisted, [])

  const [role, setRole] = useState<Role>(saved.role ?? 'student')
  const [session, setSessionRaw] = useState<AuthSession | null>(null)
  const [profileRole, setProfileRole] = useState<Role>('student')
  const [language, setLanguage] = useState<LanguageCode>(
    saved.language ?? DEMO_PROFILE.preferredLanguage,
  )
  const [profile, setProfile] = useState<StudentProfile>(saved.profile ?? DEMO_PROFILE)
  const [documents, setDocuments] = useState<StudentDocument[]>(saved.documents ?? DEMO_DOCUMENTS)
  const [applications, setApplications] = useState<Application[]>(
    saved.applications ?? DEMO_APPLICATIONS,
  )
  const [runs, setRuns] = useState<Record<string, EligibilityRun>>({})
  const [checking, setChecking] = useState(false)
  const [simulateFailure, setSimulateFailure] = useState<VerificationSource[]>(
    saved.simulateFailure ?? [],
  )
  const [toasts, setToasts] = useState<Toast[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [live, setLive] = useState(false)

  useEffect(() => {
    const payload: Persisted = { role, language, profile, documents, applications, simulateFailure }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      /* quota or private mode — the demo still works in memory */
    }
  }, [role, language, profile, documents, applications, simulateFailure])

  // Restore the session on load, and keep it in step with sign-in/sign-out that
  // happens anywhere else in the tree (including the browser's own storage
  // events, which is how a second tab signs out the first one).
  useEffect(() => {
    let alive = true
    void auth.getSession().then(({ data }) => {
      if (alive) setSessionRaw(data.session)
    })
    const unsubscribe = auth.onAuthStateChange((next) => {
      if (alive) setSessionRaw(next)
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  // The role that counts is the one in the database. A tampered localStorage is
  // a cosmetic inconvenience; a tampered `profiles.role` is a security event,
  // and the `protect_profile_role` trigger in migration 007 is what stops it.
  useEffect(() => {
    if (!session) {
      setProfileRole('student')
      return
    }
    let alive = true
    void (async () => {
      try {
        if (!supabase) return
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle()
        if (!alive) return
        const row = data as { role?: string } | null
        if (!error && row?.role) {
          setProfileRole(row.role as Role)
          setRole(row.role as Role)
        }
      } catch {
        /* offline: stay a student, which is the safe direction */
      }
    })()
    return () => {
      alive = false
    }
  }, [session])

  const setSession = useCallback(async (next: AuthSession | null) => {
    setSessionRaw(next)
  }, [])

  const signOut = useCallback(async () => {
    await auth.signOut()
    setSessionRaw(null)
    setProfileRole('student')
    setRole('student')
  }, [])

  // Keep the document language honest. Screen readers pick pronunciation and
  // the :lang() font stacks key off this attribute, so it has to track the
  // selection. It reflects the *document's* language — the full-UI tier — not
  // the assistant tier, because tribal text carries its own lang attribute on
  // the element that contains it.
  useEffect(() => {
    const docLang = isUiLanguage(language) ? language : 'en'
    document.documentElement.lang = docLang
    document.title = isUiLanguage(language)
      ? `${t(docLang, 'app.name')} · Ministry of Tribal Affairs`
      : 'JagoScholarship · Ministry of Tribal Affairs'
  }, [language])

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    setToasts((prev) => [...prev, { ...t, id }])
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 5200)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id))
  }, [])

  const updateProfile = useCallback((patch: Partial<StudentProfile>) => {
    setProfile((prev) => ({ ...prev, ...patch }))
  }, [])

  const upsertDocument = useCallback((doc: StudentDocument) => {
    setDocuments((prev) => {
      const i = prev.findIndex((d) => d.id === doc.id)
      if (i === -1) return [doc, ...prev]
      const next = [...prev]
      next[i] = doc
      return next
    })
  }, [])

  const removeDocument = useCallback((id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id))
  }, [])

  const addApplication = useCallback((a: Application) => {
    setApplications((prev) => [a, ...prev.filter((x) => x.id !== a.id)])
  }, [])

  const setApplicationStatus = useCallback((id: string, status: Application['status']) => {
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)))
  }, [])

  const toggleSimulator = useCallback((source: VerificationSource) => {
    setSimulateFailure((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source],
    )
  }, [])

  const runChecks = useCallback(
    async (schemeCodes: string[]) => {
      setChecking(true)
      try {
        const entries = await Promise.all(
          schemeCodes.map(async (code) => {
            const run = await evaluateScheme(code, profile, documents, {
              simulateFailure,
              heldSchemes: applications
                .filter((a) => a.status === 'sanctioned' || a.status === 'disbursed')
                .map((a) => ({ code: a.schemeCode, status: a.status })),
            })
            return [code, run] as const
          }),
        )
        setRuns((prev) => ({ ...prev, ...Object.fromEntries(entries) }))
      } finally {
        setChecking(false)
      }
    },
    [profile, documents, simulateFailure, applications],
  )

  // Hydrate from Supabase once, then run the first eligibility sweep.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await hydrateDemoState()
        if (cancelled) return
        if (res) {
          setProfile(res.profile)
          setDocuments(res.documents)
          setApplications(res.applications)
          setLive(true)
        }
      } catch {
        /* offline demo — keep the local dataset */
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (hydrated) void runChecks(['pre_matric', 'post_matric', 'top_class', 'nfst', 'nos'])
    // Intentionally runs once on hydration; later re-runs are user-initiated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  const value: AppState = {
    session,
    profileRole,
    isStaff: session !== null && profileRole !== 'student',
    setSession,
    signOut,
    role,
    setRole,
    language,
    setLanguage,
    profile,
    updateProfile,
    documents,
    upsertDocument,
    removeDocument,
    applications,
    addApplication,
    setApplicationStatus,
    runs,
    runChecks,
    checking,
    simulateFailure,
    toggleSimulator,
    toasts,
    toast,
    dismissToast,
    hydrated,
    live,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}

/** Convenience: the checks for a scheme, or an empty list before the first run. */
export function useRun(schemeCode: string): { checks: VerificationCheck[]; run: EligibilityRun | undefined } {
  const { runs } = useApp()
  const run = runs[schemeCode]
  return { run, checks: run?.result.checks ?? [] }
}
