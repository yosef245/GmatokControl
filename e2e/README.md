# בדיקות דפדפן מקומיות

סביבה זמנית עם Postgres, PostgREST ושרת כניסה מדומה, כדי להריץ את האפליקציה עם נתוני ההדגמה ולצלם מסכים.
לא נוגעת ב־Supabase האמיתי.

```bash
./e2e/up.sh                       # כמשתמש רגיל, לא root
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon npm run dev
node e2e/orders.mjs               # לקוחות, הזמנות, אישור, עריכה וביטול
node e2e/production.mjs           # לוח ייצור, ביטול סימון, סדר ידני, מלאי
node e2e/sprint3.mjs              # משלוחים, מחירונים, ייבוא מאקסל ודוחות (צריך python3 עם openpyxl)
```

משתמשים: u1@test.local (מנהל), u2/u3 (משווקים), u4 (מנהלת ייצור), u5 (עובד ייצור), u6 (מחסן). הסיסמה: pw.
כל תרחיש מניח סביבה נקייה: מריצים `./e2e/up.sh` לפני כל אחד.
צילומי המסך נשמרים ב־`e2e/shots`. צריך Playwright מותקן גלובלית (`npm i -g playwright`).
