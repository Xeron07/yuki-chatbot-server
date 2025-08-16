import mongoose from "mongoose";

const sourceUri =
  "mongodb+srv://biponi-stage:bf7vkR77HefBlBSd@cluster0.tgu99.mongodb.net/prior-bd_backup";
const targetUri =
  "mongodb+srv://biponi-stage:bf7vkR77HefBlBSd@cluster0.tgu99.mongodb.net/growb-stage";

async function copyDatabase() {
  const sourceConnection = mongoose.createConnection(sourceUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const targetConnection = mongoose.createConnection(targetUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  // Wait for connections to be established
  await sourceConnection.asPromise();
  await targetConnection.asPromise();

  try {
    const collections = await sourceConnection.db.listCollections().toArray();

    for (const collInfo of collections) {
      const collectionName = collInfo.name;
      console.log(`Copying collection: ${collectionName}`);

      const sourceCollection = sourceConnection.db.collection(collectionName);
      const targetCollection = targetConnection.db.collection(collectionName);

      const docs = await sourceCollection.find({}).toArray();

      if (docs.length) {
        await targetCollection.insertMany(docs);
        console.log(`Copied ${docs.length} documents to ${collectionName}`);
      } else {
        console.log(`No documents found in ${collectionName}`);
      }
    }

    console.log("Database copy completed!");
  } catch (err) {
    console.error("Error copying database:", err);
  } finally {
    await sourceConnection.close();
    await targetConnection.close();
  }
}

copyDatabase();
