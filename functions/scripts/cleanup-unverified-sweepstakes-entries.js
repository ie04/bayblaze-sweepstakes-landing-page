const admin = require("firebase-admin");

const PROJECT_ID = "bayblaze-sweepstakes";
const COLLECTION = "sweepstakes_entries";
const BATCH_SIZE = 400;
const applyCleanup = process.argv.includes("--apply");

admin.initializeApp({projectId: PROJECT_ID});

function shouldDeleteEntry(entry) {
  return entry.emailVerified !== true && entry.used !== true;
}

async function deleteInBatches(db, docs) {
  let deleted = 0;

  for (let index = 0; index < docs.length; index += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = docs.slice(index, index + BATCH_SIZE);

    chunk.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += chunk.length;
  }

  return deleted;
}

async function main() {
  const db = admin.firestore();
  const snapshot = await db.collection(COLLECTION).get();
  const docsToDelete = snapshot.docs.filter((doc) => shouldDeleteEntry(doc.data()));
  const sampleIds = docsToDelete.slice(0, 10).map((doc) => doc.id);

  console.log(`Scanned ${snapshot.size} ${COLLECTION} docs.`);
  console.log(`Found ${docsToDelete.length} unverified, unused docs to delete.`);

  if (sampleIds.length) {
    console.log(`Sample doc IDs: ${sampleIds.join(", ")}`);
  }

  if (!applyCleanup) {
    console.log("Dry run only. Re-run with --apply to delete these docs.");
    return;
  }

  const deleted = await deleteInBatches(db, docsToDelete);
  console.log(`Deleted ${deleted} docs.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
