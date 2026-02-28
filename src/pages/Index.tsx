import { Navigate } from "react-router-dom";

/**
 * Index page redirects to Landing page.
 * The "/" route in App.tsx already renders Landing directly,
 * but this ensures any stale imports also resolve correctly.
 */
const Index = () => {
  return <Navigate to="/" replace />;
};

export default Index;
