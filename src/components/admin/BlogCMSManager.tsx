// This component has been temporarily disabled due to database schema mismatches
// It references fields (api_key) and uses patterns that don't match the current schema
// To re-enable, update to use api_key_env_var and fix type assertions

export function BlogCMSManager() {
  return (
    <div className="p-8 text-center">
      <h2 className="text-2xl font-bold mb-4">Blog CMS Temporarily Unavailable</h2>
      <p className="text-muted-foreground">
        This feature is being updated to match the current database schema.
      </p>
    </div>
  );
}
