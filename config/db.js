const mongoose = require("mongoose");

const { MONGO_DB_URL } = process.env;

exports.connect = () => {
  // Connecting to the database
  mongoose.set("strictQuery", false);
  mongoose
    .connect(MONGO_DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    .then(() => {
      console.log("Successfully connected to database,yay");
    })
    .catch((error) => {
      console.log("database connection failed. exiting now...");
      console.error(error);
      process.exit(1);
    });
};
