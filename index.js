const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const port = process.env.PORT || 1111;

// middleware
app.use(cors());
app.use(express.json());

// database

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6eazk.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeaders = req.headers.authorization;
    if (!authHeaders) {
        return res.status(401).send({ message: "UnAuthorized access" })
    }
    const token = authHeaders.split(' ')[1];
    jwt.verify(token, process.env.Access_Token, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden Access' })
        }
        req.decoded = decoded;
        next();
    });
}

async function run() {
    try {
        await client.connect();
        const AppointmentCollection = client.db("doctors_portals").collection("appointment");
        const bookingCollection = client.db("doctors_portals").collection("bookings");
        const userCollection = client.db("doctors_portals").collection("users");

        // get appointment slots server
        app.get('/appointment', async (req, res) => {
            const query = {};
            const cursor = AppointmentCollection.find(query);
            const resutl = await cursor.toArray();
            res.send(resutl);
        });

        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users)
        });

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.roll === 'admin';
            res.send({ admin: isAdmin })
        })

        // make a admin
        app.put('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.roll === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: { roll: 'admin' },
                };
                const resutl = await userCollection.updateOne(filter, updateDoc);
                res.send(resutl);
            }
            else {
                res.status(403).send({ message: 'forbidden' })
            }

        })

        // update data
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const resutl = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.Access_Token, { expiresIn: '1d' });
            res.send({ resutl, token });
        })

        // get Avabile slots
        app.get('/available', async (req, res) => {
            const date = req.query.date;

            // step 1: get all appointment
            const appointments = await AppointmentCollection.find().toArray();

            // step 2: get the booking of the day. [{}, {}, {}, {}, {}, {}]
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            // step 3: for each appointment
            appointments.forEach(appointment => {
                //step 4: find bookings of that appointment. [{}, {}, {}]
                const appointmentBookings = bookings.filter(booking => booking.appointmentName === appointment.name);
                // step 5: slected slots for the appointment bookings ['', '', '']
                const booked = appointmentBookings.map(book => book.slot);
                // step 6: select thos slots that are not in booked
                const book = appointment.slots.filter(slot => !booked.includes(slot))
                appointment.slots = book;
            })

            res.send(appointments)
        });

        app.get('/booking', verifyJWT, async (req, res) => {
            const patientEmail = req.query.patientEmail;
            const decodedEmail = req.decoded.email;
            if (patientEmail === decodedEmail) {
                const query = { patientEmail: patientEmail };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            }
            else {
                return res.status(403).send({ message: "Forbidden Access" })
            }
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { appointmentName: booking.appointmentName, date: booking.date, patientName: booking.patientName };
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const resutl = await bookingCollection.insertOne(booking);
            return res.send({ success: true, resutl });
        })

    }
    finally { }

}
run().catch(console.uri);


app.get('/', (req, res) => {
    res.send('welcome to Doctors Protals Server Home page')
});

app.listen(port, () => {
    console.log('Doctors Protals Server ready...')
})