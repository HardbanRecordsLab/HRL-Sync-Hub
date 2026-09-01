import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function AuthPage() {
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem("hrl_local_app_auth", "hrl-local-app-token");
    navigate("/", { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <p className="text-sm text-muted-foreground">Local app access enabled.</p>
    </div>
  );
}