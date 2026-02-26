import DashboardLayout from '../components/DashboardLayout';
import VerificationCenter from '../components/VerificationCenter';

export default function Verification() {
  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Verification Center</h1>
          <p className="text-gray-600 mt-1">
            Verify your credentials to earn trust badges and accept jobs
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <VerificationCenter />
        </div>
      </div>
    </DashboardLayout>
  );
}
