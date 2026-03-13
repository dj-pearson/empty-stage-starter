import { Helmet } from 'react-helmet-async';
import { PseoAdminDashboard } from '@/components/admin/pseo/PseoAdminDashboard';

export default function PseoAdmin() {
  return (
    <>
      <Helmet>
        <title>pSEO Command Center - EatPal Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="container mx-auto p-6 max-w-7xl">
        <PseoAdminDashboard />
      </div>
    </>
  );
}
