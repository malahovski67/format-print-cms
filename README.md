# FORMAT — אתר דפוס עם מערכת ניהול תוכן (CMS)

אתר תדמית לדפוס/סטודיו הדפסה, עם פאנל ניהול שמאפשר לערוך טקסטים, להחליף תמונות,
לוגו, אייקונים והמלצות — והכול נשמר במסד נתונים בצד השרת.

## טכנולוגיה
- **Backend:** Node.js + Express + `node:sqlite` (ללא תלויות native)
- **Frontend:** HTML / CSS / JavaScript (Vanilla), RTL עברית
- **אחסון תוכן:** SQLite (`cms.db`) — טקסטים ותמונות (כ-data URIs)
- **אימות אדמין:** סיסמאות מגובבות (scrypt) + טוקני סשן

## הפעלה מקומית
```bash
npm install
node server.js
```
האתר יעלה בכתובת http://localhost:4322

## משתמש אדמין
פרטי ההתחברות נטענים ממשתני סביבה ולא נשמרים בקוד. בהרצה הראשונה הגדר:
```bash
# Windows (PowerShell)
$env:ADMIN_USER="your-user"; $env:ADMIN_PASS="your-strong-password"; node server.js

# macOS / Linux
ADMIN_USER=your-user ADMIN_PASS=your-strong-password node server.js
```
אם לא הוגדרו — נוצר משתמש ברירת מחדל `admin` / `changeme` (יש לשנות בייצור).

## הרצה תמידית (Windows)
מפעיל `keepalive.cmd` מריץ את השרת בלולאה (מתאושש מנפילות), וקיצור דרך
בתיקיית ה-Startup מעלה אותו אוטומטית בכל כניסה למחשב.
