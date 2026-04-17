const functions = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();

exports.deleteRejectedActs = functions.scheduler.onSchedule(
  {
    schedule: "every 1 hours",
    timeZone: "Asia/Ulaanbaatar",
  },
  async () => {
    const db = admin.firestore();
    const now = Date.now();
    const EIGHT_HOURS = 8 * 60 * 60 * 1000;

    const snap = await db
      .collection("acts")
      .where("status", "==", "rejected")
      .get();

    const batch = db.batch();
    let count = 0;

    snap.forEach((doc) => {
      const data = doc.data();
      const rejectedAt = data.rejectedAt;
      if (!rejectedAt) return;
      const rejectedMs = typeof rejectedAt.toMillis === "function"
        ? rejectedAt.toMillis()
        : rejectedAt;
      if (now - rejectedMs > EIGHT_HOURS) {
        batch.delete(doc.ref);
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
      console.log(`✅ ${count} буцаагдсан акт устгагдлаа`);
    } else {
      console.log("Устгах акт байхгүй байна");
    }
  }
);
