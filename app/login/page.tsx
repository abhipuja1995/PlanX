"use client";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";

function LoginContent() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  const errorMessage =
    error === "unauthorized_domain"
      ? "Access denied. Only @credresolve.com accounts are allowed."
      : error
      ? "Sign-in failed. Please try again."
      : null;

  return (
    <main style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "100vh",
      background: "#0f172a", fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
    }}>
      <div style={{
        background: "#1e293b", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16, padding: "48px 40px", width: "100%", maxWidth: 400,
        boxShadow: "0 25px 50px rgba(0,0,0,0.4)", textAlign: "center",
      }}>
        {/* Logo */}
        <div style={{
          fontSize: "2rem", fontWeight: 800,
          background: "linear-gradient(to right, #60a5fa, #c084fc)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          backgroundClip: "text", marginBottom: 8,
        }}>
          Nirmaan
        </div>
        <p style={{ color: "#64748b", fontSize: "0.9rem", margin: "0 0 32px" }}>
          Issue Tracker · cr-product workspace
        </p>

        {/* Error */}
        {errorMessage && (
          <div style={{
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 8, padding: "10px 14px", marginBottom: 24,
            color: "#fca5a5", fontSize: "0.85rem", lineHeight: 1.5,
          }}>
            {errorMessage}
          </div>
        )}

        {/* Sign-in button */}
        <button
          onClick={() => signIn("google", { callbackUrl: "/" })}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 10, width: "100%", padding: "12px 20px",
            background: "#fff", border: "none", borderRadius: 10,
            fontSize: "0.95rem", fontWeight: 600, color: "#1e293b",
            cursor: "pointer", transition: "opacity 0.15s",
          }}
          onMouseOver={e => (e.currentTarget.style.opacity = "0.9")}
          onMouseOut={e => (e.currentTarget.style.opacity = "1")}
        >
          {/* Google icon */}
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Sign in with Google
        </button>

        <p style={{ marginTop: 20, fontSize: "0.78rem", color: "#475569" }}>
          Only <strong style={{ color: "#94a3b8" }}>@credresolve.com</strong> accounts are permitted.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
