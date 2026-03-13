import { useState } from 'react';
import { Menu, X, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const isTradie = profile?.role === 'tradie';
  const postJobHref = user ? '/dashboard' : '/register?type=client';

  const navLinks = user
    ? isTradie
      ? [
          { name: 'Find Work', href: '/leads', isRoute: true },
          { name: 'My Jobs', href: '/jobs', isRoute: true },
          { name: 'Messages', href: '/messages', isRoute: true },
        ]
      : [
          { name: 'Post a Job', href: postJobHref, isRoute: true },
          { name: 'Find a Trade', href: '/search', isRoute: true },
          { name: 'My Jobs', href: '/jobs', isRoute: true },
          { name: 'Messages', href: '/messages', isRoute: true },
        ]
    : [
        { name: 'Post a Job', href: postJobHref, isRoute: true },
        { name: 'Find a Trade', href: '/search', isRoute: true },
        { name: 'Explore', href: '/explore', isRoute: true },
        { name: 'For Tradies', href: '/#for-tradies', isRoute: false },
        { name: 'How it Works', href: '/#how-it-works-clients', isRoute: false },
      ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
    setMobileMenuOpen(false);
  };

  return (
    <nav className="sticky top-0 bg-navy-900/95 backdrop-blur-sm border-b border-navy-800 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center group">
            <span className="text-2xl font-extrabold tracking-tight">
              <span className="text-white">Connec</span><span className="text-warm-500">Tradie</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) =>
              link.isRoute ? (
                <Link
                  key={link.name}
                  to={link.href}
                  className="text-gray-300 hover:text-warm-400 font-medium transition-colors"
                >
                  {link.name}
                </Link>
              ) : (
                <a
                  key={link.name}
                  href={link.href}
                  className="text-gray-300 hover:text-warm-400 font-medium transition-colors"
                >
                  {link.name}
                </a>
              )
            )}
          </div>

          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-warm-500 text-white font-semibold rounded-lg hover:bg-warm-600 active:scale-95 transition-all duration-200 shadow-sm hover:shadow-md min-h-[44px]"
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-4 py-2 text-gray-300 font-medium hover:text-white transition-all duration-200 hover:bg-navy-800 rounded-lg min-h-[44px] inline-flex items-center"
                >
                  Log In
                </Link>
                <Link
                  to="/register"
                  className="px-5 py-2.5 bg-warm-500 text-white font-semibold rounded-lg hover:bg-warm-600 active:scale-95 transition-all duration-200 shadow-sm hover:shadow-md min-h-[44px] inline-flex items-center"
                >
                  Get Started Free
                </Link>
              </>
            )}
          </div>

          <button
            className="md:hidden p-2 text-gray-300 hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <nav id="mobile-menu" role="navigation" aria-label="Mobile navigation" className="md:hidden py-4 border-t border-navy-800">
            <div className="flex flex-col gap-2">
              {navLinks.map((link) =>
                link.isRoute ? (
                  <Link
                    key={link.name}
                    to={link.href}
                    className="px-4 py-3 text-gray-300 hover:text-white hover:bg-navy-800 rounded-lg font-medium transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.name}
                  </Link>
                ) : (
                  <a
                    key={link.name}
                    href={link.href}
                    className="px-4 py-3 text-gray-300 hover:text-white hover:bg-navy-800 rounded-lg font-medium transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.name}
                  </a>
                )
              )}
              <div className="flex flex-col gap-2 mt-4 px-4">
                {user ? (
                  <Link
                    to="/dashboard"
                    className="flex items-center justify-center gap-2 py-3 text-center bg-warm-500 text-white font-semibold rounded-lg hover:bg-warm-600 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/login"
                      className="py-3 text-center text-gray-300 font-medium border border-navy-700 rounded-lg hover:bg-navy-800 transition-colors"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Log In
                    </Link>
                    <Link
                      to="/register"
                      className="py-3 text-center bg-warm-500 text-white font-semibold rounded-lg hover:bg-warm-600 transition-colors"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Get Started Free
                    </Link>
                  </>
                )}
              </div>
            </div>
          </nav>
        )}
      </div>
    </nav>
  );
}
