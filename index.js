const express = require('express');
const cors = require('cors');
var jwt = require('jsonwebtoken');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


// middleware 
app.use(express.json());
app.use(cors());



// jwt varify fucntion  middle ware
const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorization users' })
    }
    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).send({ err, message: 'unauthorized ' })
        }
        req.decoded = decoded;
        next();
    })
}




// mongodb ========================
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hslh8b3.mongodb.net/?retryWrites=true&w=majority`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();




        // ==================================================================

        const menuCollection = client.db("bistroBossDb").collection("menu");
        const reviewsCollection = client.db("bistroBossDb").collection("reviews");
        const cartsCollection = client.db("bistroBossDb").collection("carts");
        const usersCollection = client.db("bistroBossDb").collection("users");
        const paymentsCollection = client.db("bistroBossDb").collection("payments");



        //  isAdmin middleware 
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden user' })
            }
            else {
                next();
            }
        }





        //    CREATE jwt  
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        })


        // create users 
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const isExisting = await usersCollection.findOne(query);
            if (isExisting) {
                return res.send({ 'ex': 'user already exist' })
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        })

        // get all users 
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result)
        })
        //  delte users 
        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        })
        // update users 
        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(query, updateDoc);
            res.send(result);
        })


        //  varify user admin 
        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'admin' };
            res.send(result);
        })









        // find menu 
        app.get('/menu', async (req, res) => {
            const result = await menuCollection.find().toArray();
            res.send(result);
        })

        // add menu
        app.post('/menu', verifyJWT, verifyAdmin, async (req, res) => {
            const newMenu = req.body;
            const result = await menuCollection.insertOne(newMenu);
            res.send(result);
        })

        // delete menu 
        app.delete('/menu/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await menuCollection.deleteOne(query);
            res.send(result);
        })

        // find reviews 
        app.get('/reviews', async (req, res) => {
            const result = await reviewsCollection.find().toArray();
            res.send(result);

        })


        // add to cart 
        app.post('/carts', async (req, res) => {
            const query = req.body;
            const result = await cartsCollection.insertOne(query);
            res.send(result);
        })

        // find for cart data 
        app.get('/carts', verifyJWT, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
            }

            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access ' });
            }
            else {
                const query = { email: email };
                const result = await cartsCollection.find(query).toArray();
                res.send(result);
            }

        })


        // delete carted item 
        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartsCollection.deleteOne(query);
            res.send(result);
        })



        // payment  intent
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']
            })
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        // payment api for payment info insert in paymentCollection and delete cart ordered items
        app.post('/payment', verifyJWT, async (req, res) => {
            const payment = req.body;
            const insertResult = await paymentsCollection.insertOne(payment);

            const id = { _id: { $in: payment.cartItems.map(id => new ObjectId(id)) } };
            const deletedResult = await cartsCollection.deleteMany(id);

            res.send({ insertResult, deletedResult });
        })
        // display payment history 
        app.get('/payment-history', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await paymentsCollection.find(query).toArray();
            res.send(result);
        })

        // show all info in admin home frontend
        app.get('/admin-stats', verifyJWT, verifyAdmin, async (req, res) => {
            const totalMenu = await menuCollection.estimatedDocumentCount();
            const totalOrders = await paymentsCollection.estimatedDocumentCount();
            const totalUser = await usersCollection.estimatedDocumentCount();
            const payments = await paymentsCollection.find().toArray();
            const totalRevenue = payments.reduce((sum, payment) => sum + payment.price, 0);

            res.send({
                totalMenu,
                totalOrders,
                totalUser,
                totalRevenue
            })
        })

        /**
         * ---------------
         * BANGLA SYSTEM(second best solution)
         * ---------------
         * 1. load all payments
         * 2. for each payment, get the menuItems array
         * 3. for each item in the menuItems array get the menuItem from the menu collection
         * 4. put them in an array: allOrderedItems
         * 5. separate allOrderedItems by category using filter
         * 6. now get the quantity by using length: pizzas.length
         * 7. for each category use reduce to get the total amount spent on this category
         * 
        */
        app.get('/order-stats', verifyJWT, verifyAdmin, async (req, res) => {
            const pipeline = [
                {
                    $lookup: {
                        from: 'menu',
                        localField: 'menuItems',
                        foreignField: '_id',
                        as: 'menuItemsData'
                    }
                },
                {
                    $unwind: '$menuItemsData'
                },
                {
                    $group: {
                        _id: '$menuItemsData.category',
                        count: { $sum: 1 },
                        total: { $sum: '$menuItemsData.price' }
                    }
                },
                {
                    $project: {
                        category: '$_id',
                        count: 1,
                        total: { $round: ['$total', 2] },
                        _id: 0
                    }
                }
            ];

            const result = await paymentsCollection.aggregate(pipeline).toArray();
            res.send(result)

        })
        // ==================================================================

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

// ================================


app.get('/', (req, res) => {
    res.send('bistro boss is running');
})


app.listen(port, () => {
    console.log(`bistro boss is running , ${port}`)
})