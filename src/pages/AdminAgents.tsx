import { Helmet } from 'react-helmet-async';
import { AgentCommandCenter } from '@/components/admin/agents/AgentCommandCenter';

export default function AdminAgents() {
  return (
    <>
      <Helmet>
        <title>Agentic OS Command Center - EatPal Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="container mx-auto max-w-7xl p-6">
        <AgentCommandCenter />
      </div>
    </>
  );
}
