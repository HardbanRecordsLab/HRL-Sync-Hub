import { useNavigate } from "react-router-dom";
export default function NotFound() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center animate-fade-in">
        <p className="hrl-title text-[8rem] text-red-500/20 leading-none">404</p>
        <p className="hrl-title text-3xl text-foreground mb-3">PAGE NOT FOUND</p>
        <p className="hrl-label text-muted-foreground mb-8">This route doesn't exist in HRL Sync.</p>
        <button onClick={() => nav("/")} className="hrl-btn-primary px-6 py-2.5 rounded text-sm">
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );
}
