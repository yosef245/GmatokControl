"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icon";
import type { NavItem } from "@/lib/roles";

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/orders") return path === "/orders" || (path.startsWith("/orders/") && path !== "/orders/new");
  return path === href || path.startsWith(href + "/");
}

export function NavLinks({ items, variant }: { items: NavItem[]; variant: "rail" | "tabs" }) {
  const path = usePathname();
  const shown = variant === "tabs" ? items.filter((i) => i.href !== "/settings" && i.href !== "/customers").slice(0, 5) : items;
  return shown.map((i) => {
    const active = isActive(path, i.href);
    const base =
      variant === "rail"
        ? "flex items-center gap-2.5 rounded-lg px-3 py-2.5 font-semibold"
        : "flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[0.7rem] font-semibold";
    return (
      <Link
        key={i.href}
        href={i.href}
        aria-current={active ? "page" : undefined}
        className={`${base} ${active ? "bg-accent-soft text-accent" : "text-muted hover:bg-sunken hover:text-fg"}`}
      >
        <Icon name={i.icon} />
        <span>{i.label}</span>
      </Link>
    );
  });
}
