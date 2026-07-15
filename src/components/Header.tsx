import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export default function Header() {
  const { currentUser, initializing, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <header className="border-b border-[var(--color-line)] bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="text-sm font-semibold uppercase tracking-widest text-[var(--color-brand)]">
          AgriTech
        </Link>

        <nav className="flex items-center gap-5 text-sm">
          <Link to="/" className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]">
            Dashboard
          </Link>

          {!initializing && currentUser && (
            <Link to="/farms" className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]">
              My Farms
            </Link>
          )}

          {!initializing && currentUser ? (
            <div className="flex items-center gap-3">
              <span className="text-[var(--color-ink-soft)]">Hi, {currentUser.fullName.split(' ')[0]}</span>
              <button
                onClick={handleLogout}
                className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 font-medium text-[var(--color-ink)] hover:bg-[var(--color-paper-soft)]"
              >
                Log out
              </button>
            </div>
          ) : (
            !initializing && (
              <div className="flex items-center gap-3">
                <Link to="/login" className="text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]">
                  Log in
                </Link>
                <Link
                  to="/signup"
                  className="rounded-lg bg-[var(--color-brand)] px-3 py-1.5 font-medium text-white hover:bg-[var(--color-brand-dark)]"
                >
                  Sign up
                </Link>
              </div>
            )
          )}
        </nav>
      </div>
    </header>
  )
}
