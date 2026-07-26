"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Đăng ký thất bại. Vui lòng thử lại.");
        return;
      }

      const signInRes = await signIn("credentials", { email, password, redirect: false });
      if (signInRes?.error) {
        // Account created but auto sign-in failed for some reason — send them to login.
        router.push("/login");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Có lỗi xảy ra. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ticket ticket-enter">
      <div className="px-5 sm:px-7">
        <p className="font-mono text-[11px] font-medium tracking-[0.25em] text-muted-ink">
          BẮT ĐẦU THEO DÕI
        </p>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-ink">Tạo tài khoản</h1>

        {error && (
          <p className="mt-4 rounded-md border border-chili/30 bg-chili/10 px-3 py-2 text-sm text-chili">
            {error}
          </p>
        )}

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="name" className="block text-xs font-semibold text-muted-ink">
              Họ tên
            </label>
            <input
              id="name"
              type="text"
              required
              minLength={2}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-ink/15 bg-white/60 px-3 py-2 text-sm text-ink placeholder:text-muted-ink focus:border-marigold focus:outline-none focus:ring-2 focus:ring-marigold/40"
              placeholder="Nguyễn Văn A"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-muted-ink">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-ink/15 bg-white/60 px-3 py-2 text-sm text-ink placeholder:text-muted-ink focus:border-marigold focus:outline-none focus:ring-2 focus:ring-marigold/40"
              placeholder="ban@vidu.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-muted-ink">
              Mật khẩu
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-ink/15 bg-white/60 px-3 py-2 text-sm text-ink placeholder:text-muted-ink focus:border-marigold focus:outline-none focus:ring-2 focus:ring-marigold/40"
              placeholder="Tối thiểu 6 ký tự"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-md bg-marigold px-4 py-2.5 text-sm font-semibold text-marigold-ink transition-transform hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Đang tạo tài khoản…" : "Tạo tài khoản"}
        </button>

        <p className="mt-5 text-center text-sm text-muted-ink">
          Đã có tài khoản?{" "}
          <Link href="/login" className="font-semibold text-ink underline underline-offset-2">
            Đăng nhập
          </Link>
        </p>
      </div>
    </form>
  );
}
