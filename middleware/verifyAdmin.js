const client = require("../config/db");

const verifyAdmin = async (req, res, next) => {
  const db = client.db("startupforge");

  const usersCollection = db.collection("users");

  const email = req.decoded.email;

  const user = await usersCollection.findOne({
    email,
  });

  if (!user || user.role !== "admin") {
    return res.status(403).send({
      message: "Forbidden Access",
    });
  }

  next();
};

module.exports = verifyAdmin;