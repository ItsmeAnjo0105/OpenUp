require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { createServer } = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const privateKey = fs.readFileSync(path.join(__dirname, process.env.JAAS_PRIVATE_KEY_PATH), 'utf8');

const app = express();
const PORT = 5000;

const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Server is running');
});

app.get('/test-supabase', async (req, res) => {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: process.env.SUPABASE_KEY },
  });
  res.json({ connected: response.ok, status: response.status });
});

// POST /bookings — Booking → Care Credit check → Payment (full transaction flow)
app.post('/bookings', async (req, res) => {
  const { resident_id, psychologist_id, schedule } = req.body;

  if (!resident_id || !psychologist_id || !schedule) {
    return res.status(400).json({ error: 'resident_id, psychologist_id, and schedule are required' });
  }

  // Step 1: check if the resident has an available Care_Credit
  const { data: credits, error: creditError } = await supabase
    .from('Care_Credit')
    .select('*')
    .eq('resident_id', resident_id)
    .eq('status', 'available')
    .limit(1);

  if (creditError) {
    return res.status(500).json({ error: creditError.message });
  }

  const careCredit = credits.length > 0 ? credits[0] : null;

  // Step 2: create the Booking, linking the care credit if one was found
  const { data: bookingData, error: bookingError } = await supabase
    .from('Booking')
    .insert([{
      resident_id,
      psychologist_id,
      schedule,
      status: 'confirmed',
      care_credit_id: careCredit ? careCredit.credit_id : null,
    }])
    .select();

  if (bookingError) {
    return res.status(500).json({ error: bookingError.message });
  }

  const booking = bookingData[0];

  // Step 3: if a care credit was used, mark it as 'used' so it can't be reused
  if (careCredit) {
    const { error: updateError } = await supabase
      .from('Care_Credit')
      .update({ status: 'used' })
      .eq('credit_id', careCredit.credit_id);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }
  }

  // Step 4: create the Payment record.
  // Session fee: ₱800 to the psychologist + ₱200 to the platform = ₱1000 total.
  // If a care credit covered it, the resident owes nothing and the payment is marked 'paid'.
  const { data: paymentData, error: paymentError } = await supabase
    .from('Payment')
    .insert([{
      booking_id: booking.booking_id,
      amount: 1000,
      status: careCredit ? 'paid' : 'pending',
    }])
    .select();

  if (paymentError) {
    return res.status(500).json({ error: paymentError.message });
  }

  res.status(201).json({
    booking,
    care_credit_applied: !!careCredit,
    payment: paymentData[0],
  });
});

// GET /jitsi-token/:bookingId?name=Joan&role=resident
app.get('/jitsi-token/:bookingId', (req, res) => {
  const { bookingId } = req.params;
  const { name, role } = req.query;

  const roomName = `openup-booking-${bookingId}`;
  const isModerator = role === 'psychologist'; // psychologist moderates the session

  const payload = {
    aud: 'jitsi',
    iss: 'chat',
    sub: process.env.JAAS_APP_ID,
    room: roomName,
    exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour expiry
    context: {
      user: {
        name: name || 'Guest',
        moderator: isModerator,
      },
      features: {
        livestreaming: false,
        recording: false,
        transcription: false,
      },
    },
  };

  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    header: { kid: process.env.JAAS_KEY_ID },
  });

  res.json({ token, room: `${process.env.JAAS_APP_ID}/${roomName}` });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});