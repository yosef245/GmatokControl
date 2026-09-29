import { LoginForm } from "./login-form";
import { BrandMark } from "@/components/brand-mark";

export const metadata = { title: "כניסה · גוונים של מתוק" };

export default function LoginPage() {
  return (
    <main className="mx-auto mt-[10vh] flex max-w-md flex-col gap-5 px-4">
      <h1 className="flex flex-col items-start gap-3">
        <BrandMark size="lg" />
        <span className="font-display text-2xl text-accent">ניהול הזמנות וייצור</span>
      </h1>
      <p className="text-muted">נכנסים עם האימייל והסיסמה שקיבלתם ממנהל המפעל.</p>
      <LoginForm />
    </main>
  );
}
