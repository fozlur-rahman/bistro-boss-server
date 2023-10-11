const express = require('express');
const cors = require('cors');
var jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()

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
            console.log(email)
            if (!email) {
                res.send([]);
            }

            const decodedEmail = req.decoded.email;
            console.log(decodedEmail, email)
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