import { useState } from "react";

interface AuthPageProps {
  onAuth: (token: string) => void;
}

export function AuthPage({ onAuth }: AuthPageProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Email and password are required");
      return;
    }

    setIsLoading(true);

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.detail || data.message || "Something went wrong");
        return;
      }

      onAuth(data.token);
    } catch {
      setError("Could not connect to server");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#111111",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          width: 380,
          padding: 40,
          borderRadius: 18,
          background: "linear-gradient(145deg, rgba(30,27,46,0.95) 0%, rgba(20,17,35,0.98) 100%)",
          border: "1px solid rgba(147,51,234,0.15)",
          boxShadow: "0 25px 50px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: "#e4e4e7",
              margin: 0,
              marginBottom: 6,
            }}
          >
            Data Analyzer
          </h1>
          <p style={{ fontSize: 13, color: "#a1a1aa", margin: 0 }}>
            {mode === "login" ? "Sign in to your account" : "Create a new account"}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 500,
                color: "#a1a1aa",
                marginBottom: 6,
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(147,51,234,0.2)",
                backgroundColor: "rgba(15,13,25,0.6)",
                color: "#e4e4e7",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "rgba(147,51,234,0.5)")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(147,51,234,0.2)")}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 500,
                color: "#a1a1aa",
                marginBottom: 6,
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(147,51,234,0.2)",
                backgroundColor: "rgba(15,13,25,0.6)",
                color: "#e4e4e7",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "rgba(147,51,234,0.5)")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(147,51,234,0.2)")}
            />
          </div>

          {error && (
            <div
              style={{
                fontSize: 12,
                color: "#f87171",
                backgroundColor: "rgba(248,113,113,0.08)",
                border: "1px solid rgba(248,113,113,0.15)",
                borderRadius: 8,
                padding: "8px 12px",
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: "100%",
              padding: "11px 0",
              borderRadius: 10,
              border: "none",
              background: isLoading
                ? "rgba(147,51,234,0.3)"
                : "linear-gradient(135deg, rgba(147,51,234,0.8) 0%, rgba(107,33,168,0.9) 100%)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 550,
              cursor: isLoading ? "not-allowed" : "pointer",
              transition: "opacity 0.15s",
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading
              ? "Please wait..."
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <span style={{ fontSize: 13, color: "#a1a1aa" }}>
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          </span>
          <button
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
            }}
            style={{
              fontSize: 13,
              color: "#9333ea",
              background: "none",
              border: "none",
              padding: 0,
              fontWeight: 500,
            }}
          >
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
