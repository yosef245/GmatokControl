import { LoginForm } from "./login-form";

export const metadata = { title: "כניסה · גוונים של מתוק" };

export default function LoginPage() {
  return (
    <main className="mx-auto mt-[10vh] flex max-w-md flex-col gap-5 px-4">
      <div>
        <h1 className="font-display text-4xl text-accent">גוונים של מתוק</h1>
        <div className="mt-2 h-[3px] w-16 rounded bg-gold" />
      </div>
      <p className="text-muted">נכנסים עם מספר הטלפון. נשלח אליך קוד חד־פעמי ב־SMS.</p>
      <LoginForm />
    </main>
  );
}
