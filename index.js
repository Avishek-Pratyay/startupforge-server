require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const { ObjectId } = require("mongodb");

const client = require("./config/db");
const verifyJWT = require("./middleware/verifyJWT");
const verifyAdmin = require("./middleware/verifyAdmin");

const app = express();

app.use(
  cors({
    origin: ["http://localhost:5173",
     "https://startupforge-client-six.vercel.app",],
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  res.send("StartupForge Server Running");
});

async function run() {
  try {
    await client.connect();

    const db = client.db("startupforge");

    const usersCollection = db.collection("users");
    const startupsCollection = db.collection("startups");
    const opportunitiesCollection = db.collection("opportunities");
    const applicationsCollection = db.collection("applications");

    const paymentsCollection = db.collection("payments");
    // ==================================================
    // USERS
    // ==================================================

    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/:email", async (req, res) => {
      const result = await usersCollection.findOne({
        email: req.params.email,
      });

      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;

      const existingUser = await usersCollection.findOne({
        email: user.email,
      });

      if (existingUser) {
        return res.send({
          message: "User already exists",
        });
      }

      const result = await usersCollection.insertOne({
        ...user,
        role: user.role || "collaborator",
        isBlocked: false,
        createdAt: new Date(),
      });

      res.send(result);
    });


// UPDATE USER ROLE
app.patch("/users/:email", async (req, res) => {
  try {
    const email = req.params.email;

    const result = await usersCollection.updateOne(
      { email },
      { $set: req.body }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to update user",
    });
  }
});

    // UPDATE PROFILE
app.patch("/users/profile/:email", verifyJWT, async (req, res) => {
  const email = req.params.email;

  const updatedProfile = req.body;

  const result = await usersCollection.updateOne(
    {
      email: email,
    },
    {
      $set: {
        name: updatedProfile.name,
        image: updatedProfile.image,
        skills: updatedProfile.skills,
        bio: updatedProfile.bio,
      },
    }
  );

  res.send(result);
});

    // ==================================================
    // JWT AUTH
    // ==================================================

    app.post("/jwt", async (req, res) => {
      const { email } = req.body;

      const user = await usersCollection.findOne({ email });

      if (!user) {
  return res.status(404).send({
    message: "User not found",
  });
}

if (user.isBlocked) {
  return res.status(403).send({
    message: "User is blocked by admin",
  });
} {
  return res.status(403).send({
    message: "User is blocked by admin",
  });
}
      if (!user) {
        return res.status(404).send({
          message: "User not found",
        });
      }

      const token = jwt.sign(
        {
          email: user.email,
          role: user.role,
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "7d",
        }
      );

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
        })
        .send({
          success: true,
        });
    });

    app.post("/logout", (req, res) => {
      res.clearCookie("token",
        {
          httpOnly:true,
          secure:true,
          sameSite:"none",
        });
      res.send({
        success: true,
      });
    });

    app.get("/protected", verifyJWT, (req, res) => {
      res.send(req.decoded);
    });

    // ==================================================
    app.get(
  "/admin/startups",
  verifyJWT,
  verifyAdmin,
  async (req, res) => {
    const result = await startupsCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  }
);
    // STARTUPS
    // ==================================================

    app.post("/startups", verifyJWT, async (req, res) => {
      if (req.decoded.role !== "founder") {
        return res.status(403).send({
          message: "Only founders can create startups",
        });
      }

      const startup = req.body;

      const result = await startupsCollection.insertOne({
        ...startup,
        founderEmail: req.decoded.email,
        status: "pending",
        createdAt: new Date(),
      });

      res.send(result);
    });

    app.get("/startups", async (req, res) => {
      const result = await startupsCollection.find().toArray();
      res.send(result);
    });

    app.get("/startups/:id", async (req, res) => {
      const result = await startupsCollection.findOne({
        _id: new ObjectId(req.params.id),
      });

      res.send(result);
    });

    app.patch("/startups/:id", verifyJWT, async (req, res) => {
      const result = await startupsCollection.updateOne(
        {
          _id: new ObjectId(req.params.id),
        },
        {
          $set: req.body,
        }
      );

      res.send(result);
    });

    app.delete("/startups/:id", verifyJWT, async (req, res) => {
      const result = await startupsCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });

      res.send(result);
    });

    // ==================================================
    // OPPORTUNITIES
    // ==================================================
app.post("/opportunities", verifyJWT, async (req, res) => {
  try {
    if (req.decoded.role !== "founder") {
      return res.status(403).send({
        message: "Only founders can create opportunities",
      });
    }

    const founder = await usersCollection.findOne({
      email: req.decoded.email,
    });

    const totalOpportunities =
      await opportunitiesCollection.countDocuments({
        founderEmail: req.decoded.email,
      });

    const isPremiumFounder =
      founder?.isPremiumFounder || false;

    if (
      totalOpportunities >= 3 &&
      !isPremiumFounder
    ) {
      return res.status(403).send({
        premiumRequired: true,
        message:
          "Premium package required to create more than 3 opportunities",
      });
    }

    const opportunity = req.body;

    const result =
      await opportunitiesCollection.insertOne({
        ...opportunity,
        founderEmail: req.decoded.email,
        createdAt: new Date(),
      });

    res.send(result);
  } catch (error) {
    console.log(error);

    res.status(500).send({
      message: "Failed to create opportunity",
    });
  }
});
    app.get("/opportunities", async (req, res) => {
      const {
        search = "",
        workType,
        industry,
        page = 1,
        limit = 6,
      } = req.query;

      const query = {};

      if (search) {
        query.$or = [
          {
            role_title: {
              $regex: search,
              $options: "i",
            },
          },
          {
            required_skills: {
              $elemMatch: {
                $regex: search,
                $options: "i",
              },
            },
          },
        ];
      }

      if (workType) {
        query.work_type = {
          $in: workType.split(","),
        };
      }

      if (industry) {
        query.industry = {
          $in: industry.split(","),
        };
      }

      const pageNumber = parseInt(page);
      const limitNumber = parseInt(limit);

      const total = await opportunitiesCollection.countDocuments(query);

      const opportunities = await opportunitiesCollection
        .find(query)
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber)
        .toArray();

      res.send({
        total,
        currentPage: pageNumber,
        totalPages: Math.ceil(total / limitNumber),
        opportunities,
      });
    });

    app.get("/opportunities/:id", async (req, res) => {
      const result = await opportunitiesCollection.findOne({
        _id: new ObjectId(req.params.id),
      });

      res.send(result);
    });

    app.patch("/opportunities/:id", verifyJWT, async (req, res) => {
      const result = await opportunitiesCollection.updateOne(
        {
          _id: new ObjectId(req.params.id),
        },
        {
          $set: req.body,
        }
      );

      res.send(result);
    });

    app.delete("/opportunities/:id", verifyJWT, async (req, res) => {
      const result = await opportunitiesCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });

      res.send(result);
    });

    // ==================================================
    // APPLICATIONS
    // ==================================================

    app.post("/applications", verifyJWT, async (req, res) => {
      const application = req.body;

      const existingApplication =
        await applicationsCollection.findOne({
          opportunity_id: application.opportunity_id,
          applicant_email: application.applicant_email,
        });

      if (existingApplication) {
        return res.status(400).send({
          message: "Already applied to this opportunity",
        });
      }

      const result = await applicationsCollection.insertOne({
        ...application,
        status: "Pending",
        applied_at: new Date(),
      });

      res.send(result);
    });

app.get("/my-applications/:email", async (req, res) => {
try {
const applications = await applicationsCollection
.find({
applicant_email: req.params.email,
})
.toArray();


const enrichedApplications = await Promise.all(
  applications.map(async (app) => {
    const opportunity =
      await opportunitiesCollection.findOne({
        _id: new ObjectId(app.opportunity_id),
      });

    return {
      ...app,

      role_title:
        opportunity?.role_title || "Opportunity",

      industry:
        opportunity?.industry || "N/A",

      work_type:
        opportunity?.work_type || "N/A",

      deadline:
        opportunity?.deadline || "N/A",

      required_skills:
        opportunity?.required_skills || [],

      startup_name:
        opportunity?.startup_name || "Startup",

      founder_email:
        opportunity?.founder_email || "N/A",
    };
  })
);

res.send(enrichedApplications);


} catch (error) {
console.log(error);


res.status(500).send({
  message: "Failed to fetch applications",
});


}
});

    app.get("/applications", verifyJWT, async (req, res) => {
      const result = await applicationsCollection
        .find()
        .sort({
          applied_at: -1,
        })
        .toArray();

      res.send(result);
    });

    app.patch("/applications/accept/:id", verifyJWT, async (req, res) => {
      const result = await applicationsCollection.updateOne(
        {
          _id: new ObjectId(req.params.id),
        },
        {
          $set: {
            status: "Accepted",
          },
        }
      );

      res.send(result);
    });

    app.patch("/applications/reject/:id", verifyJWT, async (req, res) => {
      const result = await applicationsCollection.updateOne(
        {
          _id: new ObjectId(req.params.id),
        },
        {
          $set: {
            status: "Rejected",
          },
        }
      );

      res.send(result);
    });
 
//hfhjfgjhfgvjj
app.get(
  "/founder-applications/:email",
  verifyJWT,
  async (req, res) => {

    const founderEmail = req.params.email;

    const opportunities =
      await opportunitiesCollection
        .find({ founderEmail })
        .toArray();

    const opportunityIds =
      opportunities.map((o) => o._id.toString());

    const applications =
      await applicationsCollection
        .find({
          opportunity_id: {
            $in: opportunityIds,
          },
        })
        .toArray();

    res.send(applications);
  }
);
    // ==================================================
// STRIPE PAYMENT
// ==================================================

app.post(
  "/create-checkout-session",
  verifyJWT,
  async (req, res) => {
    try {
      const { amount } = req.body;

      const session =
        await stripe.checkout.sessions.create({
          payment_method_types: ["card"],

          line_items: [
            {
              price_data: {
                currency: "usd",

                product_data: {
                  name: "StartupForge Premium Founder",
                },

                unit_amount: amount * 100,
              },

              quantity: 1,
            },
          ],

          mode: "payment",

          success_url:
            `${process.env.CLIENT_URL}/payment-success`,

          cancel_url:
            `${process.env.CLIENT_URL}/dashboard`,
        });

      res.send({
        url: session.url,
      });
    } catch (error) {
      console.log(error);
      res.status(500).send({
        message: "Stripe session failed",
      });
    }
  }
);


app.post(
  "/payments",
  verifyJWT,
  async (req, res) => {
    const payment = req.body;

    const result =
      await paymentsCollection.insertOne({
        ...payment,
        paid_at: new Date(),
      });

    await usersCollection.updateOne(
      {
        email: payment.user_email,
      },
      {
        $set: {
          isPremiumFounder: true,
        },
      }
    );

    res.send(result);
  }
);
app.post(
  "/payments",
  verifyJWT,
  async (req, res) => {
    const payment = req.body;

    const existingPayment =
      await paymentsCollection.findOne({
        user_email: payment.user_email,
      });

    if (existingPayment) {
      return res.send({
        message: "Already premium",
      });
    }

    const result =
      await paymentsCollection.insertOne({
        ...payment,
        paid_at: new Date(),
      });

    await usersCollection.updateOne(
      {
        email: payment.user_email,
      },
      {
        $set: {
          isPremiumFounder: true,
        },
      }
    );

    res.send(result);
  }
);


// ==================================================
// ADMIN REVENUE STATS
// ==================================================

app.get(
  "/admin-overview",
  verifyJWT,
  verifyAdmin,
  async (req, res) => {
    const totalUsers =
      await usersCollection.countDocuments();

    // ONLY APPROVED STARTUPS
    const totalStartups =
      await startupsCollection.countDocuments({
        status: "Approved",
      });

    const totalOpportunities =
      await opportunitiesCollection.countDocuments();

    const payments =
      await paymentsCollection.find().toArray();

    const totalRevenue = payments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );

    res.send({
      totalUsers,
      totalStartups,
      totalOpportunities,
      totalRevenue,
    });
  }
);// ==================================================
// TRANSACTIONS
// ==================================================

app.get(
  "/transactions",
  verifyJWT,
  verifyAdmin,
  async (req, res) => {
    const result =
      await paymentsCollection
        .find()
        .sort({
          paid_at: -1,
        })
        .toArray();

    res.send(result);
  }
);




// ==================================================
// FOUNDER OVERVIEW
// ==================================================

app.get(
  "/founder-overview/:email",
  verifyJWT,
  async (req, res) => {
    const email = req.params.email;

    const totalOpportunities =
      await opportunitiesCollection.countDocuments({
        founderEmail: email,
      });

    const founderOpportunities =
      await opportunitiesCollection
        .find({
          founderEmail: email,
        })
        .toArray();

    const opportunityIds =
      founderOpportunities.map(
        (item) => item._id.toString()
      );

    const applications =
      await applicationsCollection
        .find({
          opportunity_id: {
            $in: opportunityIds,
          },
        })
        .toArray();

    const totalApplications =
      applications.length;

    const acceptedMembers =
      applications.filter(
        (item) =>
          item.status === "Accepted"
      ).length;

    res.send({
      totalOpportunities,
      totalApplications,
      acceptedMembers,
    });
  }
);

app.get(
  "/admin/users",
  verifyJWT,
  verifyAdmin,
  async (req, res) => {
    const result = await usersCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  }
);
app.patch(
  "/admin/users/block/:id",
  verifyJWT,
  verifyAdmin,
  async (req, res) => {
    const result = await usersCollection.updateOne(
      {
        _id: new ObjectId(req.params.id),
      },
      {
        $set: {
          isBlocked: true,
        },
      }
    );

    res.send(result);
  }
);
app.patch(
  "/admin/users/unblock/:id",
  verifyJWT,
  verifyAdmin,
  async (req, res) => {
    const result = await usersCollection.updateOne(
      {
        _id: new ObjectId(req.params.id),
      },
      {
        $set: {
          isBlocked: false,
        },
      }
    );

    res.send(result);
  }
);
app.get(
  "/admin/startups",
  verifyJWT,
  verifyAdmin,
  async (req, res) => {
    const result = await startupsCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  }
);
app.patch(
  "/admin/startups/approve/:id",
  verifyJWT,
  verifyAdmin,
  async (req, res) => {
    const result = await startupsCollection.updateOne(
      {
        _id: new ObjectId(req.params.id),
      },
      {
        $set: {
          status: "Approved",
        },
      }
    );

    res.send(result);
  }
);
app.delete(
  "/admin/startups/:id",
  verifyJWT,
  verifyAdmin,
  async (req, res) => {
    const result =
      await startupsCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });

    res.send(result);
  }
);
// ====
    // ==============================================
    // ADMIN
    // ==================================================

    app.get(
      "/admin-stats",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const totalUsers =
          await usersCollection.countDocuments();

        const totalStartups =
          await startupsCollection.countDocuments();

        const totalOpportunities =
          await opportunitiesCollection.countDocuments();

        const totalApplications =
          await applicationsCollection.countDocuments();

        res.send({
          totalUsers,
          totalStartups,
          totalOpportunities,
          totalApplications,
        });
      }
    );

    app.patch(
      "/users/block/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const result = await usersCollection.updateOne(
          {
            _id: new ObjectId(req.params.id),
          },
          {
            $set: {
              isBlocked: true,
            },
          }
        );

        res.send(result);
      }
    );

    app.patch(
      "/users/unblock/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const result = await usersCollection.updateOne(
          {
            _id: new ObjectId(req.params.id),
          },
          {
            $set: {
              isBlocked: false,
            },
          }
        );

        res.send(result);
      }
    );

    app.patch(
      "/startups/approve/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const result = await startupsCollection.updateOne(
          {
            _id: new ObjectId(req.params.id),
          },
          {
            $set: {
              status: "approved",
            },
          }
        );

        res.send(result);
      }
    );

    app.delete(
      "/admin/startups/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const result = await startupsCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });

        res.send(result);
      }
    );

    console.log("MongoDB Connected Successfully");
  } catch (error) {
    console.log(error);
  }
}

run();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});