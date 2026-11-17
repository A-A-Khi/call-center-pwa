# كول سنتر — تسجيل العملاء (PWA مشترك)

تطبيق ويب للكول سنتر: تسجيل العملاء + استهداف المحتملين + تصدير Excel/CSV، مع **سجل مشترك** لكل الفريق عبر Firebase.

## الرابط

- GitHub: https://github.com/A-A-Khi/call-center-pwa
- الموقع: https://a-a-khi.github.io/call-center-pwa/

## تفعيل السجل المشترك (مرة واحدة)

1. افتح [Firebase Console](https://console.firebase.google.com/) وسجّل بجوجل
2. **Create a project** باسم مثل `call-center`
3. من القائمة: **Build → Firestore Database → Create database**
4. اختر **Start in test mode** ثم الموقع الأقرب
5. من ⚙️ **Project settings → Your apps → Web** انسخ `firebaseConfig`
6. الصق القيم في ملف `firebase-config.js`
7. (اختياري) انشر قواعد `firestore.rules.txt` من تبويب Rules
8. ارفع التعديل على GitHub

بعدها أي موظف يفتح نفس الرابط يشوف **نفس العملاء** لحظيًا.

## المميزات

- فورم سريع أثناء المكالمة
- فلترة للمهتمين/المحتملين/المحجوزين
- مزامنة مباشرة بين الأجهزة
- تصدير Excel بجداول: الكل / الملخص / المحتملين / المحجوزين
- تصميم متجاوب للموبايل والديسكتوب
