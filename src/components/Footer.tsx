import { Link } from 'react-router-dom';
import { Mail, MapPin } from 'lucide-react';

interface FooterLink {
  name: string;
  href: string;
  isHash?: boolean;
}

const footerLinks: Record<string, FooterLink[]> = {
  homeowners: [
    { name: 'Post a Job', href: '/register?type=client' },
    { name: 'How It Works', href: '/#how-it-works-clients', isHash: true },
    { name: 'Browse Trades', href: '/explore' },
  ],
  platform: [
    { name: 'Find a Trade', href: '/search' },
    { name: 'Pricing', href: '/pricing' },
  ],
  support: [
    { name: 'Contact Us', href: '/contact' },
    { name: 'Help & FAQs', href: '/help' },
  ],
  legal: [
    { name: 'Terms of Service', href: '/terms' },
    { name: 'Privacy Policy', href: '/privacy' },
  ],
  tradies: [
    { name: 'Register as Tradie', href: '/register?type=tradie' },
    { name: 'For Tradies', href: '/#for-tradies', isHash: true },
  ],
};

export default function Footer() {
  return (
    <footer className="bg-navy-900 text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-16 lg:py-20">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-8 lg:gap-10">
            <div className="col-span-2">
              <Link to="/" className="flex items-center group">
                <span className="text-xl font-bold">
                  <span className="text-white">Connec</span><span className="text-warm-500">Tradie</span>
                </span>
              </Link>

              <p className="mt-4 text-gray-400 leading-relaxed max-w-sm">
                Australia's verified trade platform. Every professional is ABN-checked, licensed, and reviewed by real clients before they can quote.
              </p>

              <div className="mt-6 space-y-3">
                <a href="mailto:admin@connectradie.com" className="flex items-center gap-3 text-gray-400 hover:text-white transition-colors">
                  <Mail className="w-5 h-5" />
                  <span>admin@connectradie.com</span>
                </a>
                <div className="flex items-center gap-3 text-gray-400">
                  <MapPin className="w-5 h-5" />
                  <span>Sydney, Australia</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">For Homeowners</h4>
              <ul className="space-y-3">
                {footerLinks.homeowners.map((link) => (
                  <li key={link.name}>
                    {link.isHash ? (
                      <a href={link.href} className="text-gray-400 hover:text-white transition-colors">
                        {link.name}
                      </a>
                    ) : (
                      <Link to={link.href} className="text-gray-400 hover:text-white transition-colors">
                        {link.name}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Platform</h4>
              <ul className="space-y-3">
                {footerLinks.platform.map((link) => (
                  <li key={link.name}>
                    {link.isHash ? (
                      <a href={link.href} className="text-gray-400 hover:text-white transition-colors">
                        {link.name}
                      </a>
                    ) : (
                      <Link to={link.href} className="text-gray-400 hover:text-white transition-colors">
                        {link.name}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Support</h4>
              <ul className="space-y-3">
                {footerLinks.support.map((link) => (
                  <li key={link.name}>
                    <Link to={link.href} className="text-gray-400 hover:text-white transition-colors">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-3">
                {footerLinks.legal.map((link) => (
                  <li key={link.name}>
                    <Link to={link.href} className="text-gray-400 hover:text-white transition-colors">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-4">For Tradies</h4>
              <ul className="space-y-3">
                {footerLinks.tradies.map((link) => (
                  <li key={link.name}>
                    {link.isHash ? (
                      <a href={link.href} className="text-gray-400 hover:text-white transition-colors">
                        {link.name}
                      </a>
                    ) : (
                      <Link to={link.href} className="text-gray-400 hover:text-white transition-colors">
                        {link.name}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="py-6 border-t border-navy-800">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-500 text-sm">
              &copy; 2026 Connec<span className="text-warm-500">Tradie</span> Australia. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <Link to="/terms" className="hover:text-gray-300 transition-colors">Terms</Link>
              <Link to="/privacy" className="hover:text-gray-300 transition-colors">Privacy</Link>
              <Link to="/contact" className="hover:text-gray-300 transition-colors">Contact</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
