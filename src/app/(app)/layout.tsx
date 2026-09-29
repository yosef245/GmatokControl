import { getStaff } from "@/lib/auth";
import { navFor, ROLE_LABELS } from "@/lib/roles";
import { NavLinks } from "@/components/nav-links";
import { BrandMark } from "@/components/brand-mark";
import { ActionForm } from "@/components/action-form";
import { btnPrimary, Field, inputCls } from "@/components/ui";
import { changePassword } from "@/lib/actions/account";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const staff = await getStaff();
  if (!staff) return <NoAccess />;
  if (staff.mustChangePassword) return <ChangePassword name={staff.fullName} />;
  const nav = navFor(staff.roles);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <nav aria-label="ניווט" className="sticky top-0 hidden h-screen flex-col gap-1 border-e border-line bg-surface px-3 py-5 md:flex">
        <div className="mb-2 flex flex-col items-start gap-2 border-b border-line px-2.5 pb-4">
          <BrandMark />
          <div className="text-xs text-muted">ניהול הזמנות וייצור</div>
        </div>
        <NavLinks items={nav} variant="rail" />
      </nav>
      <div className="min-w-0 pb-24 md:pb-10">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface px-4 py-3 md:px-6">
          <span className="md:hidden">
            <BrandMark size="sm" />
          </span>
          <form action="/auth/signout" method="post" className="ms-auto">
            <button className="flex items-center gap-2 rounded-full border border-line bg-bg py-1 ps-3 pe-1.5 text-sm" title="יציאה">
              <span>
                <b>{staff.fullName}</b> · {staff.roles.map((r) => ROLE_LABELS[r]).join(", ")}
              </span>
              <span className="grid size-7 place-items-center rounded-full bg-accent text-xs font-bold text-on-accent">
                {staff.fullName.trim()[0]}
              </span>
            </button>
          </form>
        </header>
        <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5 md:px-6">{children}</main>
      </div>
      <nav aria-label="ניווט" className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line bg-surface px-1 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] md:hidden">
        <NavLinks items={nav} variant="tabs" />
      </nav>
    </div>
  );
}

function NoAccess() {
  return (
    <main className="mx-auto mt-[10vh] flex max-w-md flex-col gap-4 px-4">
      <h1 className="font-display text-3xl text-accent">אין גישה עדיין</h1>
      <p>האימייל שלך לא מופיע ברשימת העובדים. בקשו ממנהל המפעל להוסיף אתכם בהגדרות, ואז היכנסו שוב.</p>
      <form action="/auth/signout" method="post">
        <button className="min-h-11 rounded-lg border border-line bg-surface px-4 font-bold">יציאה</button>
      </form>
    </main>
  );
}

function ChangePassword({ name }: { name: string }) {
  return (
    <main className="mx-auto mt-[10vh] flex max-w-md flex-col gap-4 px-4">
      <div className="self-start"><BrandMark size="lg" /></div>
      <h1 className="font-display text-3xl text-accent">שלום {name}, בוחרים סיסמה</h1>
      <p>נכנסת עם הסיסמה הראשונית. בחר/י סיסמה משלך, לפחות 6 תווים. איתה נכנסים מעכשיו.</p>
      <ActionForm action={changePassword} className="flex flex-col gap-3">
        <Field label="סיסמה חדשה"><input name="password" type="password" autoComplete="new-password" className={inputCls} dir="ltr" required minLength={6} autoFocus /></Field>
        <Field label="שוב, לאימות"><input name="confirm" type="password" autoComplete="new-password" className={inputCls} dir="ltr" required minLength={6} /></Field>
        <button className={btnPrimary}>שמירת הסיסמה</button>
      </ActionForm>
      <form action="/auth/signout" method="post">
        <button className="text-sm text-muted underline">זה לא אני, יציאה</button>
      </form>
    </main>
  );
}
