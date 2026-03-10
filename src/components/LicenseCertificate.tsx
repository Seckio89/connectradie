import { useRef } from 'react';
import {
  Shield,
  BadgeCheck,
  X,
  Printer,
  MapPin,
  Calendar,
  Hash,
  Building2,
} from 'lucide-react';

interface LicenseCertificateProps {
  isOpen: boolean;
  onClose: () => void;
  holderName: string;
  licenseNumber: string;
  licenseState: string;
  expiryDate: string;
  businessName?: string;
  abnNumber?: string;
  tradeType?: string;
  verifiedTrades?: string[];
  verifiedDate?: string;
}

export default function LicenseCertificate({
  isOpen,
  onClose,
  holderName,
  licenseNumber,
  licenseState,
  expiryDate,
  businessName,
  abnNumber,
  tradeType,
  verifiedTrades = [],
  verifiedDate,
}: LicenseCertificateProps) {
  const certRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const expiry = new Date(expiryDate);
  const issued = verifiedDate ? new Date(verifiedDate) : new Date();
  const certId = `CT-${licenseState}-${licenseNumber.replace(/\s/g, '').slice(-6)}-${issued.getFullYear()}`;

  const handlePrint = () => {
    const printContent = certRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>License Certificate - ${holderName}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');

            * { margin: 0; padding: 0; box-sizing: border-box; }

            @page {
              size: A4 landscape;
              margin: 0;
            }

            body {
              font-family: 'Inter', sans-serif;
              background: white;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              padding: 20px;
            }

            .cert-outer {
              width: 100%;
              max-width: 960px;
              aspect-ratio: 1.414;
              border: 3px solid #5C4F4B;
              border-radius: 4px;
              padding: 8px;
              background: white;
            }

            .cert-inner {
              width: 100%;
              height: 100%;
              border: 1px solid #C6BED3;
              border-radius: 2px;
              padding: 48px 56px;
              display: flex;
              flex-direction: column;
              position: relative;
              overflow: hidden;
            }

            .watermark {
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              font-size: 180px;
              font-weight: 700;
              color: rgba(30, 58, 95, 0.03);
              font-family: 'Playfair Display', serif;
              pointer-events: none;
              white-space: nowrap;
            }

            .corner-ornament {
              position: absolute;
              width: 80px;
              height: 80px;
              border-color: #5C4F4B;
              border-style: solid;
              opacity: 0.2;
            }
            .corner-tl { top: 16px; left: 16px; border-width: 3px 0 0 3px; }
            .corner-tr { top: 16px; right: 16px; border-width: 3px 3px 0 0; }
            .corner-bl { bottom: 16px; left: 16px; border-width: 0 0 3px 3px; }
            .corner-br { bottom: 16px; right: 16px; border-width: 0 3px 3px 0; }

            .cert-header {
              text-align: center;
              margin-bottom: 32px;
              position: relative;
              z-index: 1;
            }

            .cert-header .org-name {
              font-size: 13px;
              letter-spacing: 4px;
              text-transform: uppercase;
              color: #5C4F4B;
              font-weight: 600;
              margin-bottom: 12px;
            }

            .cert-header h1 {
              font-family: 'Playfair Display', serif;
              font-size: 36px;
              font-weight: 700;
              color: #5C4F4B;
              margin-bottom: 8px;
            }

            .cert-header .subtitle {
              font-size: 14px;
              color: #A08B86;
              font-weight: 500;
            }

            .divider {
              width: 120px;
              height: 2px;
              background: linear-gradient(90deg, transparent, #5C4F4B, transparent);
              margin: 0 auto 32px;
            }

            .cert-body {
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              position: relative;
              z-index: 1;
            }

            .holder-name {
              font-family: 'Playfair Display', serif;
              font-size: 32px;
              font-weight: 700;
              color: #26201E;
              margin-bottom: 6px;
              text-align: center;
            }

            .business-name {
              font-size: 15px;
              color: #7D6B66;
              font-weight: 500;
              margin-bottom: 24px;
            }

            .cert-details {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 24px;
              width: 100%;
              max-width: 720px;
              margin-bottom: 28px;
            }

            .detail-item {
              text-align: center;
              padding: 16px;
              background: #F5F0EF;
              border-radius: 8px;
              border: 1px solid #EBE1DF;
            }

            .detail-label {
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 1.5px;
              color: #A08B86;
              font-weight: 600;
              margin-bottom: 6px;
            }

            .detail-value {
              font-size: 16px;
              font-weight: 700;
              color: #26201E;
              font-family: 'Inter', monospace;
            }

            .trades-section {
              text-align: center;
              margin-bottom: 28px;
            }

            .trades-label {
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 1.5px;
              color: #A08B86;
              font-weight: 600;
              margin-bottom: 10px;
            }

            .trades-list {
              display: flex;
              gap: 8px;
              flex-wrap: wrap;
              justify-content: center;
            }

            .trade-badge {
              padding: 5px 14px;
              background: #5C4F4B;
              color: white;
              border-radius: 20px;
              font-size: 12px;
              font-weight: 600;
            }

            .cert-footer {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              width: 100%;
              padding-top: 20px;
              border-top: 1px solid #EBE1DF;
              position: relative;
              z-index: 1;
            }

            .footer-item {
              text-align: center;
            }

            .footer-item .label {
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 1px;
              color: #8C7CA7;
              font-weight: 600;
              margin-bottom: 4px;
            }

            .footer-item .value {
              font-size: 13px;
              color: #5C4F4B;
              font-weight: 600;
            }

            .seal {
              width: 72px;
              height: 72px;
              border-radius: 50%;
              border: 2px solid #5C4F4B;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-direction: column;
              color: #5C4F4B;
            }

            .seal-text {
              font-size: 7px;
              text-transform: uppercase;
              letter-spacing: 1px;
              font-weight: 700;
            }

            .seal-icon {
              font-size: 24px;
              margin: 2px 0;
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 " onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">License Certificate</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-navy-800 text-white text-sm font-medium rounded-lg hover:bg-navy-900 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-8 bg-gray-50">
          <div ref={certRef}>
            <div className="cert-outer" style={{
              border: '3px solid #5C4F4B',
              borderRadius: '4px',
              padding: '8px',
              background: 'white',
            }}>
              <div style={{
                border: '1px solid #C6BED3',
                borderRadius: '2px',
                padding: '48px 56px',
                position: 'relative',
                overflow: 'hidden',
                minHeight: '560px',
                display: 'flex',
                flexDirection: 'column',
              }}>
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontSize: '140px',
                  fontWeight: 700,
                  color: 'rgba(30, 58, 95, 0.03)',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                }}>
                  VERIFIED
                </div>

                <div style={{ position: 'absolute', top: 16, left: 16, width: 60, height: 60, borderTop: '3px solid #5C4F4B', borderLeft: '3px solid #5C4F4B', opacity: 0.2 }} />
                <div style={{ position: 'absolute', top: 16, right: 16, width: 60, height: 60, borderTop: '3px solid #5C4F4B', borderRight: '3px solid #5C4F4B', opacity: 0.2 }} />
                <div style={{ position: 'absolute', bottom: 16, left: 16, width: 60, height: 60, borderBottom: '3px solid #5C4F4B', borderLeft: '3px solid #5C4F4B', opacity: 0.2 }} />
                <div style={{ position: 'absolute', bottom: 16, right: 16, width: 60, height: 60, borderBottom: '3px solid #5C4F4B', borderRight: '3px solid #5C4F4B', opacity: 0.2 }} />

                <div style={{ textAlign: 'center', marginBottom: 28, position: 'relative', zIndex: 1 }}>
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <Shield className="w-5 h-5" style={{ color: '#5C4F4B' }} />
                    <span style={{
                      fontSize: 12,
                      letterSpacing: 4,
                      textTransform: 'uppercase',
                      color: '#5C4F4B',
                      fontWeight: 600,
                    }}>
                      ConnecTrade Verification Authority
                    </span>
                    <Shield className="w-5 h-5" style={{ color: '#5C4F4B' }} />
                  </div>
                  <h1 style={{
                    fontSize: 32,
                    fontWeight: 700,
                    color: '#5C4F4B',
                    marginBottom: 6,
                    letterSpacing: 1,
                  }}>
                    Certificate of Verification
                  </h1>
                  <p style={{ fontSize: 13, color: '#A08B86', fontWeight: 500 }}>
                    This certifies that the below-named holder has been verified on the ConnecTrade platform
                  </p>
                </div>

                <div style={{
                  width: 100,
                  height: 2,
                  background: 'linear-gradient(90deg, transparent, #5C4F4B, transparent)',
                  margin: '0 auto 28px',
                }} />

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                  <div style={{
                    fontSize: 30,
                    fontWeight: 700,
                    color: '#26201E',
                    marginBottom: 4,
                    textAlign: 'center',
                  }}>
                    {holderName}
                  </div>

                  {businessName && (
                    <div className="flex items-center gap-1.5" style={{ fontSize: 14, color: '#7D6B66', fontWeight: 500, marginBottom: 24 }}>
                      <Building2 className="w-4 h-4" style={{ color: '#A08B86' }} />
                      {businessName}
                    </div>
                  )}
                  {!businessName && <div style={{ marginBottom: 24 }} />}

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: abnNumber ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)',
                    gap: 20,
                    width: '100%',
                    maxWidth: 720,
                    marginBottom: 24,
                  }}>
                    <div style={{
                      textAlign: 'center',
                      padding: '14px 12px',
                      background: '#F5F0EF',
                      borderRadius: 8,
                      border: '1px solid #EBE1DF',
                    }}>
                      <div className="flex items-center justify-center gap-1 mb-1.5">
                        <Hash className="w-3 h-3" style={{ color: '#A08B86' }} />
                        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5, color: '#A08B86', fontWeight: 600 }}>
                          License No.
                        </span>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#26201E', fontFamily: 'monospace' }}>
                        {licenseNumber}
                      </div>
                    </div>

                    <div style={{
                      textAlign: 'center',
                      padding: '14px 12px',
                      background: '#F5F0EF',
                      borderRadius: 8,
                      border: '1px solid #EBE1DF',
                    }}>
                      <div className="flex items-center justify-center gap-1 mb-1.5">
                        <MapPin className="w-3 h-3" style={{ color: '#A08B86' }} />
                        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5, color: '#A08B86', fontWeight: 600 }}>
                          State
                        </span>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#26201E' }}>
                        {licenseState}
                      </div>
                    </div>

                    <div style={{
                      textAlign: 'center',
                      padding: '14px 12px',
                      background: '#F5F0EF',
                      borderRadius: 8,
                      border: '1px solid #EBE1DF',
                    }}>
                      <div className="flex items-center justify-center gap-1 mb-1.5">
                        <Calendar className="w-3 h-3" style={{ color: '#A08B86' }} />
                        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5, color: '#A08B86', fontWeight: 600 }}>
                          Valid Until
                        </span>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#26201E' }}>
                        {expiry.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>

                    {abnNumber && (
                      <div style={{
                        textAlign: 'center',
                        padding: '14px 12px',
                        background: '#F5F0EF',
                        borderRadius: 8,
                        border: '1px solid #EBE1DF',
                      }}>
                        <div className="flex items-center justify-center gap-1 mb-1.5">
                          <Building2 className="w-3 h-3" style={{ color: '#A08B86' }} />
                          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5, color: '#A08B86', fontWeight: 600 }}>
                            ABN
                          </span>
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#26201E', fontFamily: 'monospace' }}>
                          {abnNumber}
                        </div>
                      </div>
                    )}
                  </div>

                  {(verifiedTrades.length > 0 || tradeType) && (
                    <div style={{ textAlign: 'center', marginBottom: 24 }}>
                      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5, color: '#A08B86', fontWeight: 600, marginBottom: 10 }}>
                        Verified Trade Qualifications
                      </div>
                      <div className="flex gap-2 flex-wrap justify-center">
                        {verifiedTrades.length > 0 ? verifiedTrades.map((trade) => (
                          <span
                            key={trade}
                            style={{
                              padding: '5px 16px',
                              background: '#5C4F4B',
                              color: 'white',
                              borderRadius: 20,
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            {trade}
                          </span>
                        )) : tradeType ? (
                          <span style={{
                            padding: '5px 16px',
                            background: '#5C4F4B',
                            color: 'white',
                            borderRadius: 20,
                            fontSize: 12,
                            fontWeight: 600,
                          }}>
                            {tradeType}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                  width: '100%',
                  paddingTop: 20,
                  borderTop: '1px solid #EBE1DF',
                  position: 'relative',
                  zIndex: 1,
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: '#8C7CA7', fontWeight: 600, marginBottom: 4 }}>
                      Date Issued
                    </div>
                    <div style={{ fontSize: 12, color: '#5C4F4B', fontWeight: 600 }}>
                      {issued.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                  </div>

                  <div style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    border: '2px solid #5C4F4B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    color: '#5C4F4B',
                  }}>
                    <span style={{ fontSize: 7, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Verified</span>
                    <BadgeCheck className="w-5 h-5" style={{ margin: '2px 0' }} />
                    <span style={{ fontSize: 7, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>ConnecTrade</span>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: '#8C7CA7', fontWeight: 600, marginBottom: 4 }}>
                      Certificate ID
                    </div>
                    <div style={{ fontSize: 12, color: '#5C4F4B', fontWeight: 600, fontFamily: 'monospace' }}>
                      {certId}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
