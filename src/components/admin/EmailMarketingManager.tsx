// This component has been temporarily disabled due to missing database tables
// It references tables (email_lists, email_subscribers, email_campaigns, email_templates) that don't exist
// To re-enable, create the necessary database tables and schema

export function EmailMarketingManager() {
  return (
    <div className="p-8 text-center">
      <h2 className="text-2xl font-bold mb-4">Email Marketing Temporarily Unavailable</h2>
      <p className="text-muted-foreground">
        This feature requires additional database setup.
      </p>
    </div>
  );
}
