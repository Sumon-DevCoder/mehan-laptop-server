const express = require("express");
const app = express();
const port = process.env.PORT || 4000;
require("dotenv").config();
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_TEST_SECRECT_KEY);
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { reset } = require("nodemon");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jlzdidu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// middleware
app.use(express.json());
app.use(cors());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // await client.connect();

    const laptopCollection = client.db("mehanDB").collection("laptops");
    const userCollection = client.db("mehanDB").collection("users");
    const cartCollection = client.db("mehanDB").collection("carts");
    const paymentCollection = client.db("mehanDB").collection("payments");

    // jwt related apis route
    app.post("/jwt", (req, res) => {
      const user = req.body;
      // generate token
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRECT, {
        expiresIn: "24h",
      });
      res.send({ token });
    });

    // middlwares
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      const token = req.headers.authorization.split(" ")[1];

      jwt.verify(token, process.env.ACCESS_TOKEN_SECRECT, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // verify admin after verify token
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded?.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // user collection apis routes
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // verify admin
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded?.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };

      // user does exist
      const isExists = await userCollection.findOne(query);
      if (isExists) {
        return res.send({ message: "user already exists" });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // laptop collection apis routes
    app.get("/laptops", async (req, res) => {
      const result = await laptopCollection.find().toArray();
      res.send(result);
    });

    app.get("/laptops/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await laptopCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/laptops", verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await laptopCollection.insertOne(item);
      res.send(result);
    });

    app.patch("/laptops/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const item = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          brand: item.brand,
          model: item.model,
          processor: item.processor,
          ram: item.ram,
          storage: item.storage,
          graphics: item.graphics,
          price: item.price,
          description: item.description,
          image: item.image,
        },
      };
      const result = await laptopCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.delete("/laptops/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await laptopCollection.deleteOne(query);
      res.send(result);
    });

    // carts collection apis routes
    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/carts", verifyToken, async (req, res) => {
      const laptopItem = req.body;
      const result = await cartCollection.insertOne(laptopItem);
      res.send(result);
    });

    app.delete("/carts/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(filter);
      res.send(result);
    });

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;

      // create payment method intent
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // payment collection apis routes
    app.get("/payment/:email", verifyToken, async (req, res) => {
      const query = { email: req.params.email };

      if (req.params.email !== req.decoded.email) {
        res.status(403).send({ message: "forbidden access" });
      }

      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/payment", async (req, res) => {
      const paymentInfo = req.body;
      const paymentResult = await paymentCollection.insertOne(paymentInfo);

      // carefully delete each carts items
      const query = {
        _id: {
          $in: paymentInfo.cartIds.map((id) => new ObjectId(id)),
        },
      };

      const deletedResult = await cartCollection.deleteMany(query);

      // send user  email about payment confirmation
      

      res.send({ paymentResult, deletedResult });
    });

    // stats or analytics apis route
    app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const laptopItems = await laptopCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      // this is not the best way
      // const payment = await paymentCollection.find().toArray();
      // const revenue = payment.reduce((total, item) => total + item.price, 0);

      const result = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totlaRevenue: {
                $sum: "$price",
              },
            },
          },
        ])
        .toArray();

      const revenue = result.length > 0 ? result[0].totlaRevenue : 0;

      res.send({ users, laptopItems, orders, revenue });
    });

    // using aggregate pipeline
    app.get("/order-stats", async (req, res) => {
      const result = await paymentCollection
        .aggregate([
          {
            $unwind: "$laptopItemIds",
          },
          {
            $lookup: {
              from: "laptops",
              localField: "laptopItemIds",
              foreignField: "_id",
              as: "laptopItems",
            },
          },
          {
            $unwind: "$laptopItems",
          },
          // {
          //   $group: {
          //     _id: "$laptopItems.category",
          //     quantity: {
          //       $sum: 1,
          //     },
          //   },
          // },
        ])
        .toArray();

      res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server is running...");
});

app.listen(port, () => {
  console.log(`server is running successfully at localhost:${port}`);
});
