import Link from "next/link";
import { getStaff } from "@/lib/auth";
import { navFor } from "@/lib/roles";
import { Icon } from "@/components/icon";
import { PageTitle } from "@/components/ui";

export default async function MorePage() {
  const staff = (await getStaff())!;
  return (
    <>
      <PageTitle>תפריט</PageTitle>
      <ul className="grid grid-cols-2 gap-3">
        {navFor(staff.roles).map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="flex min-h-16 items-center gap-3 rounded-xl border border-line bg-surface px-4 font-bold">
              <Icon name={i.icon} /> {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
