// MongoDB connection. .env mein MONGO_URI (MONGODB_URI bhi chalega).
const mongoose = require("mongoose");

require("dotenv").config();

// Link mein database ka naam na ho (Atlas ka ".../?retryWrites=true") to Mongo "test"
// database use karta hai — isliye naam na ho to apna "uliketailor".
const DEFAULT_DB = "uliketailor";

function dbNameFromUri(uri) {
  const m = String(uri).match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/);
  return m && m[1] ? decodeURIComponent(m[1]) : null;
}

const connectDB = async (uri = process.env.MONGO_URI || process.env.MONGODB_URI) => {
  try {
    if (!uri) throw new Error("MONGO_URI .env mein nahi hai (.env.example dekhein)");
    const opts = { serverSelectionTimeoutMS: 8000 };
    if (!dbNameFromUri(uri)) opts.dbName = process.env.MONGODB_DB || DEFAULT_DB;
    await mongoose.connect(uri, opts);
    console.log(`MongoDB connected (${mongoose.connection.name})`);
    return mongoose.connection;
  } catch (error) {
    console.error("MongoDB Error:", error.message);
    process.exit(1);
  }
};

// Saare indexes taiyaar. Kisi model ka index badla ho (jaise users.phone ab zaroori nahi, isliye
// "sparse") to purana index hata kar naya bana dete hain — warna server start nahi hota.
async function initIndexes() {
  for (const m of Object.values(mongoose.models)) {
    try {
      await m.init();
    } catch (e) {
      const conflict = [85, 86].includes(e && e.code) || /IndexOptionsConflict|IndexKeySpecsConflict|different options/.test(String((e && (e.codeName || e.message)) || ''));
      if (!conflict) throw e;
      console.log(`${m.modelName}: purane indexes update ho rahe hain`);
      await m.syncIndexes();
    }
  }
}

module.exports = connectDB;
module.exports.initIndexes = initIndexes;
module.exports.dbNameFromUri = dbNameFromUri;
