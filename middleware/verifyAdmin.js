const client = require("../config/db");

const verifyAdmin = async (req, res, next) => {
  try {
    const db = client.db("startupforge");

    const usersCollection = db.collection("users");

    const user = await usersCollection.findOne({
      email: req.decoded.email,
    });

    if (!user || user.role !== "admin") {
      return res.status(403).send({
        message: "Forbidden Access",
      });
    }

    next();
  } catch (error) {
    res.status(500).send({
      message: "Admin verification failed",
    });
  }
};

module.exports = verifyAdmin;