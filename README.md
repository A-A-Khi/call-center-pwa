# كول سنتر — تسجيل العملاء (PWA مشترك)

تطبيق كول سنتر بـ **Vite + Firebase (npm)**  
سجل واحد مشترك لكل الفريق + تصدير Excel/CSV + تصميم متجاوب.

## الروابط

- الكود: https://github.com/A-A-Khi/call-center-pwa
- الموقع: https://a-a-khi.github.io/call-center-pwa/

## التشغيل محليًا

```bash
npm install
npm run dev
```

## البناء

```bash
npm run build
```

## Firebase

المشروع مربوط على `call-center-doc`.

لازم يكون **Firestore Database** مُنشأ:

1. [Firebase Console](https://console.firebase.google.com/project/call-center-doc/firestore)
2. Create database → **Start in test mode**
3. انشر قواعد `firestore.rules.txt` لو حابب

بعدها أي موظف يفتح نفس الرابط يشوف نفس العملاء لحظيًا.
