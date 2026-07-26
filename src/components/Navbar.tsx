"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

const links = [
  { href: "/dashboard", label: "Chụp món ăn" },
  { href: "/history", label: "Lịch sử" },
];

export function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-black/20 bg-bg-raised/95 backdrop-blur supports-[backdrop-filter]:bg-bg-raised/80">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href={session ? "/dashboard" : "/"} className="flex items-center gap-2 shrink-0">
          <span className="grid h-8 w-8 place-items-center rounded-sm bg-marigold text-marigold-ink font-display font-black text-sm">
            CC
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight text-cream">
            Calo Count
          </span>
        </Link>

        {status === "authenticated" && (
          <nav className="flex items-center gap-1 sm:gap-2">
            {links.map((link) => {
              const active = pathname === link.href || pathname?.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3 ${
                    active
                      ? "bg-marigold text-marigold-ink"
                      : "text-cream/80 hover:bg-bg-raised-2 hover:text-cream"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="flex items-center gap-2 sm:gap-3">
          {status === "loading" ? null : session ? (
            <>
              <span className="hidden max-w-[9rem] truncate text-sm text-muted sm:inline">
                {session.user?.name}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="rounded-md border border-cream/20 px-3 py-1.5 text-sm font-medium text-cream/90 transition-colors hover:border-chili hover:bg-chili/10 hover:text-chili cursor-pointer"
              >
                Đăng xuất
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-cream/90 hover:text-cream"
              >
                Đăng nhập
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-marigold px-3 py-1.5 text-sm font-semibold text-marigold-ink transition-transform hover:brightness-105 active:scale-95"
              >
                Đăng ký
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
