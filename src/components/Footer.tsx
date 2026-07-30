import { Link } from 'react-router-dom';
import { Mail, MapPin } from 'lucide-react';

interface FooterLink {
  name: string;
  href: string;
  isHash?: boolean;
}

const footerLinks: Record<string, FooterLink[]> = {
  tradies: [
    { name: 'Register as Tradie', href: '/register?type=tradie' },
    { name: 'Trade Jobs', href: '/careers' },
    { name: 'Features', href: '/#for-tradies', isHash: true },
    { name: 'How It Works', href: '/#how-it-works', isHash: true },
    { name: 'Pricing', href: '/pricing' },
  ],
  homeowners: [
    { name: 'Hire a Tradie', href: '/hire' },
    { name: 'Post a Job', href: '/register?type=client' },
    { name: 'How Escrow Works', href: '/hire#protected' },
  ],
  support: [
    { name: 'Contact Us', href: '/contact' },
    { name: 'Help & FAQs', href: '/help' },
  ],
  legal: [
    { name: 'Terms of Service', href: '/terms' },
    { name: 'Privacy Policy', href: '/privacy' },
  ],
};

export default function Footer() {
  return (
    <footer className="bg-ct-ink text-ct-mute">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-16 lg:py-20">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 lg:gap-10">
            <div className="col-span-2">
              <Link to="/" className="flex items-center group">
                <span className="text-xl font-bold">
                  <span className="text-ct-ink">Connec</span><span className="text-ct-teal">Tradie</span>
                </span>
              </Link>

              <p className="mt-4 text-ct-mute leading-relaxed max-w-sm">
                The all-in-one app for Australian tradies — jobs, site calendar, team scheduling, GST invoicing and Stripe-secured payments in one place.
              </p>

              <div className="mt-6 space-y-3">
                <a href="mailto:admin@connectradie.com" className="flex items-center gap-3 text-ct-mute hover:text-ct-ink transition-colors">
                  <Mail className="w-5 h-5" />
                  <span>admin@connectradie.com</span>
                </a>
                <div className="flex items-center gap-3 text-ct-mute">
                  <MapPin className="w-5 h-5" />
                  <span>Sydney, Australia</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-ct-ink font-semibold mb-4">For Tradies</h4>
              {/* No space-y here: the links carry py-2.5 instead, which turns a
                  24px row + 12px gap into a real 44px tap target at roughly the
                  same visual rhythm. */}
              <ul>
                {footerLinks.tradies.map((link) => (
                  <li key={link.name}>
                    {link.isHash ? (
                      <a href={link.href} className="block py-2.5 text-ct-mute hover:text-ct-ink transition-colors">
                        {link.name}
                      </a>
                    ) : (
                      <Link to={link.href} className="block py-2.5 text-ct-mute hover:text-ct-ink transition-colors">
                        {link.name}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-ct-ink font-semibold mb-4">For Homeowners</h4>
              {/* No space-y here: the links carry py-2.5 instead, which turns a
                  24px row + 12px gap into a real 44px tap target at roughly the
                  same visual rhythm. */}
              <ul>
                {footerLinks.homeowners.map((link) => (
                  <li key={link.name}>
                    {link.isHash ? (
                      <a href={link.href} className="block py-2.5 text-ct-mute hover:text-ct-ink transition-colors">
                        {link.name}
                      </a>
                    ) : (
                      <Link to={link.href} className="block py-2.5 text-ct-mute hover:text-ct-ink transition-colors">
                        {link.name}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-ct-ink font-semibold mb-4">Support</h4>
              {/* No space-y here: the links carry py-2.5 instead, which turns a
                  24px row + 12px gap into a real 44px tap target at roughly the
                  same visual rhythm. */}
              <ul>
                {footerLinks.support.map((link) => (
                  <li key={link.name}>
                    <Link to={link.href} className="block py-2.5 text-ct-mute hover:text-ct-ink transition-colors">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-ct-ink font-semibold mb-4">Legal</h4>
              {/* No space-y here: the links carry py-2.5 instead, which turns a
                  24px row + 12px gap into a real 44px tap target at roughly the
                  same visual rhythm. */}
              <ul>
                {footerLinks.legal.map((link) => (
                  <li key={link.name}>
                    <Link to={link.href} className="block py-2.5 text-ct-mute hover:text-ct-ink transition-colors">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="py-6 border-t border-ct-line">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-ct-mute text-sm">
              &copy; 2026 Connec<span className="text-ct-teal">Tradie</span> Australia. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-sm text-ct-mute">
              <Link to="/terms" className="py-3 hover:text-ct-mute transition-colors">Terms</Link>
              <Link to="/privacy" className="py-3 hover:text-ct-mute transition-colors">Privacy</Link>
              <Link to="/contact" className="py-3 hover:text-ct-mute transition-colors">Contact</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
