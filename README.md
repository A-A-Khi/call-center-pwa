# كول سنتر + مواعيد الطبيب

تطبيقات بـ **Vite + Firebase**:
1. **كول سنتر** — تسجيل العملاء والحجوزات
2. **مواعيد الطبيب** — كالندر للمواعيد مع تعديل/إلغاء وإشعارات

## الروابط

- الكود: https://github.com/A-A-Khi/call-center-pwa
- الكول سنتر: https://a-a-khi.github.io/call-center-pwa/
- مواعيد الطبيب: https://a-a-khi.github.io/call-center-pwa/doctor.html

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

## مواعيد الزيارة

لما الموظف يختار **تم الحجز؟ نعم** يظهر حقل **تاريخ الزيارة** و**ساعة الزيارة** (مطلوبين).

- البيانات تتحفظ على العميل في `leads`
- ونسخة منظمة تتحفظ في مجموعة `appointments`
- برنامج الطبيب يقرأ `appointments` لحظيًا (شهر / أسبوع / يوم) ويقدر يعدّل أو يلغي الموعد
- الإشعارات من المتصفح: حجوزات جديدة + ملخص مواعيد اليوم

محليًا: افتح `/doctor.html` بعد `npm run dev`.

حدّث قواعد Firestore من `firestore.rules.txt` لو مجموعة `appointments` اترفضت.
