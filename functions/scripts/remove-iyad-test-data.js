const admin = require("firebase-admin");

const PROJECT_ID = "bayblaze-sweepstakes";
const TARGET_EMAIL = "iyad@eltifi.com";
const BATCH_SIZE = 400;
const applyCleanup = process.argv.includes("--apply");

admin.initializeApp({projectId: PROJECT_ID});

function addDocsByPath(targetMap, docs) {
  docs.forEach((doc) => targetMap.set(doc.ref.path, doc));
}

async function deleteDocs(db, refs) {
  let deleted = 0;

  for (let index = 0; index < refs.length; index += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = refs.slice(index, index + BATCH_SIZE);

    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
    deleted += chunk.length;
  }

  return deleted;
}

async function main() {
  const db = admin.firestore();
  const responsesByEmail = await db
    .collection("survey_responses")
    .where("email", "==", TARGET_EMAIL)
    .get();
  const responseDocsByPath = new Map();

  addDocsByPath(responseDocsByPath, responsesByEmail.docs);

  const responseDocs = [...responseDocsByPath.values()];
  const refsToDelete = responseDocs.map((doc) => doc.ref);

  console.log(`Target email: ${TARGET_EMAIL}`);
  console.log(`Keeping sweepstakes_entries/${TARGET_EMAIL}.`);
  console.log(`survey_responses with matching email found: ${responseDocs.length}`);

  if (responseDocs.length) {
    console.log(
      `Survey response IDs: ${responseDocs.map((doc) => doc.id).join(", ")}`
    );
  }

  if (!applyCleanup) {
    console.log("Dry run only. Re-run with --apply to delete these docs.");
    return;
  }

  const deleted = await deleteDocs(db, refsToDelete);
  console.log(`Deleted ${deleted} docs.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
