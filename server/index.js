require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { createServer } = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// Prefer a plain env var holding the PEM contents directly (reliable on any host —
// no dependency on a platform's "secret file" mount actually being present at boot).
// Falls back to reading a local file for local dev, where JAAS_PRIVATE_KEY_PATH
// points at server/jaas-private-key.pk.
const privateKey = process.env.JAAS_PRIVATE_KEY
  ? process.env.JAAS_PRIVATE_KEY.replace(/\\n/g, '\n')
  : fs.readFileSync(path.resolve(__dirname, process.env.JAAS_PRIVATE_KEY_PATH), 'utf8');

const app = express();
const PORT = 5000;

const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

io.on('connection', (socket) => {
  console.log('A user connected');

  // Anonymous Chat real-time delivery. The client must prove (via its JWT) that it's
  // actually one of this booking's two participants before it's allowed to join the
  // room -- otherwise anyone could guess a bookingId and eavesdrop on someone else's chat.
  socket.on('join-booking-chat', async ({ bookingId, token }) => {
    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);
      const role = await getBookingParticipantRole(bookingId, user);
      if (!role) return socket.emit('chat-error', { error: 'Not authorized for this conversation' });
      socket.join(`booking-${bookingId}`);
    } catch {
      socket.emit('chat-error', { error: 'Invalid session' });
    }
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(cors());
app.use(express.json());

// Verifies the JWT /auth/login already issues and attaches its payload (user_id, role,
// name) as req.user. /auth/login has signed these tokens since day one, but nothing
// ever actually checked them on subsequent requests — every route just trusted whatever
// ids were in the request body. This is the first route to actually enforce it.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'Missing or invalid Authorization header' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Use after requireAuth. requireRole('admin', 'psychologist') etc.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that' });
    }
    next();
  };
}

// Returns 'resident' or 'psychologist' if this user is one of the two participants
// on this booking, or null otherwise. Used to gate access to that booking's chat --
// the whole point of Anonymous Chat is that only these two people can ever see it.
async function getBookingParticipantRole(bookingId, user) {
  const { data: booking, error } = await supabase
    .from('Booking')
    .select('resident_id, psychologist_id')
    .eq('booking_id', bookingId)
    .single();

  if (error || !booking) return null;

  if (user.role === 'resident' && booking.resident_id === user.user_id) return 'resident';

  if (user.role === 'psychologist') {
    const { data: psychologist } = await supabase
      .from('Psychologist')
      .select('psychologist_id')
      .eq('user_id', user.user_id)
      .single();
    if (psychologist && psychologist.psychologist_id === booking.psychologist_id) return 'psychologist';
  }

  return null;
}

app.get('/', (req, res) => {
  res.send('Server is running');
});

app.get('/test-supabase', async (req, res) => {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: process.env.SUPABASE_KEY },
  });
  res.json({ connected: response.ok, status: response.status });
});

app.get('/barangays', async (req, res) => {
  const { data, error } = await supabase.from('Barangay').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/bookings/user/:userId', async (req, res) => {
  const { userId } = req.params;

  const { data, error } = await supabase
    .from('Booking')
    .select('*, Psychologist(psychologist_id, license_no, User(name)), Payment(payment_id, amount, status)')
    .eq('resident_id', userId)
    .order('schedule', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PayMongo Checkout Sessions: PayMongo hosts the actual payment page (card entry or
// GCash QR) so we never touch raw card details. Basic Auth with the secret key as
// username and an empty password, base64-encoded, is PayMongo's documented auth scheme.
async function paymongoRequest(method, path, body) {
  const auth = Buffer.from(`${process.env.PAYMONGO_SECRET_KEY}:`).toString('base64');
  const res = await fetch(`https://api.paymongo.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.errors?.[0]?.detail || 'PayMongo request failed');
  return data;
}

// Verifies the caller (resident or the psychologist on the booking) actually owns
// this Payment before letting them start or check on a checkout for it.
async function getPaymentIfOwned(paymentId, user) {
  const { data: payment, error } = await supabase
    .from('Payment')
    .select('*, Booking(resident_id, psychologist_id)')
    .eq('payment_id', paymentId)
    .single();

  if (error || !payment) return null;
  if (user.role === 'resident' && payment.Booking.resident_id === user.user_id) return payment;

  if (user.role === 'psychologist') {
    const { data: psychologist } = await supabase
      .from('Psychologist')
      .select('psychologist_id')
      .eq('user_id', user.user_id)
      .single();
    if (psychologist && psychologist.psychologist_id === payment.Booking.psychologist_id) return payment;
  }

  return null;
}

// POST /payments/:id/checkout — creates a PayMongo Checkout Session for a 'pending'
// Payment and returns its checkout_url for the browser to redirect to.
app.post('/payments/:id/checkout', requireAuth, requireRole('resident'), async (req, res) => {
  const payment = await getPaymentIfOwned(req.params.id, req.user);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (payment.status !== 'pending') return res.status(409).json({ error: 'This payment is not pending' });

  try {
    const session = await paymongoRequest('POST', '/checkout_sessions', {
      data: {
        attributes: {
          send_email_receipt: false,
          show_description: true,
          show_line_items: true,
          line_items: [
            {
              currency: 'PHP',
              amount: Math.round(Number(payment.amount) * 100), // PayMongo uses centavos
              name: 'OpenUp counseling session',
              quantity: 1,
            },
          ],
          payment_method_types: ['card', 'gcash', 'paymaya'],
          success_url: `${process.env.FRONTEND_URL}/payment/result?payment_id=${payment.payment_id}&status=success`,
          cancel_url: `${process.env.FRONTEND_URL}/payment/result?payment_id=${payment.payment_id}&status=cancelled`,
        },
      },
    });

    await supabase
      .from('Payment')
      .update({ paymongo_checkout_session_id: session.data.id })
      .eq('payment_id', payment.payment_id);

    res.json({ checkout_url: session.data.attributes.checkout_url });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /payments/:id/sync — call after the resident returns from PayMongo's checkout
// page. Looks up the real status directly from PayMongo (source of truth) rather than
// trusting the success/cancel redirect alone, which a user could reach without paying.
app.get('/payments/:id/sync', requireAuth, async (req, res) => {
  const payment = await getPaymentIfOwned(req.params.id, req.user);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  if (payment.status !== 'pending' || !payment.paymongo_checkout_session_id) {
    return res.json({ status: payment.status });
  }

  try {
    const session = await paymongoRequest('GET', `/checkout_sessions/${payment.paymongo_checkout_session_id}`);
    const paid = (session.data.attributes.payments || []).some((p) => p.attributes.status === 'paid');

    if (paid) {
      const { data, error } = await supabase
        .from('Payment')
        .update({ status: 'paid' })
        .eq('payment_id', payment.payment_id)
        .select();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ status: data[0].status });
    }

    res.json({ status: payment.status });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/psychologists', async (req, res) => {
  const { data, error } = await supabase
    .from('Psychologist')
    .select('psychologist_id, license_no, is_verified, credentials, specialties, rating, session_price, profile_photo_url, User(name)')
    .eq('is_verified', true);

  if (error) return res.status(500).json({ error: error.message });

  // Resolve stored storage paths to actual displayable URLs
  const withPhotoUrls = data.map((p) => ({
    ...p,
    profile_photo_url: p.profile_photo_url
      ? supabase.storage.from('psychologist-photos').getPublicUrl(p.profile_photo_url).data.publicUrl
      : null,
  }));

  res.json(withPhotoUrls);
});

// GET /psychologists/me — the logged-in psychologist's own profile, regardless of
// verification status (the public /psychologists list above only shows is_verified=true,
// which is exactly the status a psychologist waiting on approval needs to see).
app.get('/psychologists/me', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { data, error } = await supabase
    .from('Psychologist')
    .select('*')
    .eq('user_id', req.user.user_id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'No psychologist profile found for this account' });
  res.json(data);
});

// PATCH /psychologists/me — self-editable profile fields only. license_no, credentials,
// is_verified, and is_available stay controlled by signup/admin verification and are
// deliberately not accepted here.
app.patch('/psychologists/me', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { specialties, years_experience, languages, availability, session_price } = req.body;

  const updates = {};
  if (specialties !== undefined) updates.specialties = specialties;
  if (languages !== undefined) updates.languages = languages;
  if (availability !== undefined) updates.availability = availability;

  if (years_experience !== undefined) {
    updates.years_experience = years_experience === '' || years_experience === null ? null : Number(years_experience);
  }

  if (session_price !== undefined) {
    const price = Number(session_price);
    if (!price || price <= 0) return res.status(400).json({ error: 'session_price must be a positive number' });
    updates.session_price = price;
  }

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const { data, error } = await supabase
    .from('Psychologist')
    .update(updates)
    .eq('user_id', req.user.user_id)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: 'No psychologist profile found for this account' });
  res.json(data[0]);
});

// GET /admin/psychologists?status=pending|verified|all (default: pending)
app.get('/admin/psychologists', requireAuth, requireRole('admin'), async (req, res) => {
  const status = req.query.status || 'pending';

  let query = supabase
    .from('Psychologist')
    .select('psychologist_id, user_id, license_no, credentials, specialties, session_price, is_verified, is_available, User(name, email, status)');

  if (status === 'pending') query = query.eq('is_verified', false);
  if (status === 'verified') query = query.eq('is_verified', true);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /admin/psychologists/:id/verify — approves an application: makes them
// visible in the public /psychologists listing and immediately bookable.
app.post('/admin/psychologists/:id/verify', requireAuth, requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('Psychologist')
    .update({ is_verified: true, is_available: true })
    .eq('psychologist_id', req.params.id)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: 'Psychologist not found' });
  res.json(data[0]);
});

// POST /admin/psychologists/:id/reject — leaves is_verified false (so they stay out
// of every listing) and marks the underlying User account 'rejected' so the decision
// is on record instead of the application just silently sitting there forever.
app.post('/admin/psychologists/:id/reject', requireAuth, requireRole('admin'), async (req, res) => {
  const { data: psychologist, error: findError } = await supabase
    .from('Psychologist')
    .select('user_id')
    .eq('psychologist_id', req.params.id)
    .single();

  if (findError || !psychologist) return res.status(404).json({ error: 'Psychologist not found' });

  const { error: updateError } = await supabase
    .from('User')
    .update({ status: 'rejected' })
    .eq('user_id', psychologist.user_id);

  if (updateError) return res.status(500).json({ error: updateError.message });
  res.json({ rejected: true });
});

// GET /admin/bookings?status=pending|confirmed|all (default: all except cancelled/declined)
app.get('/admin/bookings', requireAuth, requireRole('admin'), async (req, res) => {
  const status = req.query.status;

  let query = supabase
    .from('Booking')
    .select('*, User(name), Psychologist(psychologist_id, User(name))')
    .order('schedule', { ascending: true });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  } else if (!status) {
    query = query.not('status', 'in', '(cancelled,declined)');
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /admin/bookings/:id/cancel — see db/admin_booking_management.sql. Releases any
// reserved/used credit and marks the Payment refunded or cancelled as appropriate.
app.post('/admin/bookings/:id/cancel', requireAuth, requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase.rpc('admin_cancel_booking', { p_booking_id: req.params.id });

  if (error) {
    if (error.message === 'BOOKING_NOT_FOUND') return res.status(404).json({ error: 'Booking not found' });
    if (error.message === 'ALREADY_TERMINAL') return res.status(409).json({ error: 'This booking is already cancelled or declined' });
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// POST /admin/bookings/:id/reassign — body: { psychologist_id }. Recomputes the
// Payment against the new psychologist's own session_price if already confirmed.
app.post('/admin/bookings/:id/reassign', requireAuth, requireRole('admin'), async (req, res) => {
  const { psychologist_id } = req.body;
  if (!psychologist_id) return res.status(400).json({ error: 'psychologist_id is required' });

  const { data, error } = await supabase.rpc('admin_reassign_booking', {
    p_booking_id: req.params.id,
    p_new_psychologist_id: psychologist_id,
  });

  if (error) {
    if (error.message === 'BOOKING_NOT_FOUND') return res.status(404).json({ error: 'Booking not found' });
    if (error.message === 'ALREADY_TERMINAL') return res.status(409).json({ error: 'This booking is already cancelled or declined' });
    if (error.message === 'NEW_PSYCHOLOGIST_NOT_FOUND_OR_UNVERIFIED') {
      return res.status(404).json({ error: 'That psychologist was not found or is not verified' });
    }
    if (error.code === '23505') {
      return res.status(409).json({ error: 'That psychologist already has a booking at this exact time' });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// POST /bookings — claim credit + create Booking + create Payment as one Postgres
// transaction (see db/create_booking_transaction.sql). If any step fails — including
// the unique-slot conflict — Postgres rolls back all of it, so there's never a
// booking left without a payment, or a credit stranded as 'used' with nothing to show for it.
// Creates a *request* (status 'pending', credit only reserved) — it isn't confirmed
// until the psychologist accepts it. See POST /bookings/:id/accept and /decline below.
app.post('/bookings', async (req, res) => {
  const { resident_id, psychologist_id, schedule } = req.body;

  if (!resident_id || !psychologist_id || !schedule) {
    return res.status(400).json({ error: 'resident_id, psychologist_id, and schedule are required' });
  }

  const { data, error } = await supabase.rpc('create_booking_transaction', {
    p_resident_id: resident_id,
    p_psychologist_id: psychologist_id,
    p_schedule: schedule,
    p_auto_confirm: false,
  });

  if (error) {
    if (error.message === 'PSYCHOLOGIST_NOT_FOUND') {
      return res.status(404).json({ error: 'Psychologist not found' });
    }
    if (error.code === '23505') {
      return res.status(409).json({ error: 'This slot was just requested by someone else. Please pick another time.' });
    }
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json(data);
});

// GET /psychologists/me/booking-requests — the logged-in psychologist's own pending
// appointment requests, oldest first.
app.get('/psychologists/me/booking-requests', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { data: psychologist, error: psychError } = await supabase
    .from('Psychologist')
    .select('psychologist_id')
    .eq('user_id', req.user.user_id)
    .single();

  if (psychError || !psychologist) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data, error } = await supabase
    .from('Booking')
    .select('*, User(name)')
    .eq('psychologist_id', psychologist.psychologist_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /psychologists/me/bookings?status=confirmed — the logged-in psychologist's own
// confirmed sessions (as opposed to /booking-requests above, which is pending-only).
app.get('/psychologists/me/bookings', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { data: psychologist, error: psychError } = await supabase
    .from('Psychologist')
    .select('psychologist_id')
    .eq('user_id', req.user.user_id)
    .single();

  if (psychError || !psychologist) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  let query = supabase
    .from('Booking')
    .select('*, User(name)')
    .eq('psychologist_id', psychologist.psychologist_id)
    .order('schedule', { ascending: true });

  if (req.query.status) query = query.eq('status', req.query.status);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /psychologists/me/dashboard-summary — stats + charts for the Dashboard home page.
app.get('/psychologists/me/dashboard-summary', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { data: psychologist, error: psychError } = await supabase
    .from('Psychologist')
    .select('psychologist_id')
    .eq('user_id', req.user.user_id)
    .single();

  if (psychError || !psychologist) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data: bookings, error: bookingsError } = await supabase
    .from('Booking')
    .select('booking_id, resident_id, schedule, status')
    .eq('psychologist_id', psychologist.psychologist_id);

  if (bookingsError) return res.status(500).json({ error: bookingsError.message });

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentMonthKey = now.toISOString().slice(0, 7);

  const confirmedBookings = bookings.filter((b) => b.status === 'confirmed');
  const todaysSessions = confirmedBookings.filter((b) => b.schedule.slice(0, 10) === todayStr);
  const completedSessions = confirmedBookings.filter((b) => new Date(b.schedule) < now);
  const pendingRequests = bookings.filter((b) => b.status === 'pending');

  // Monthly earnings: only count Payment rows actually marked 'paid' as earned. A
  // 'pending' payment is money the resident hasn't paid yet -- counting it as
  // "earnings" would claim money that was never actually received.
  const thisMonthBookingIds = confirmedBookings
    .filter((b) => b.schedule.slice(0, 7) === currentMonthKey)
    .map((b) => b.booking_id);

  let monthlyEarningsPaid = 0;
  let monthlyEarningsPending = 0;
  if (thisMonthBookingIds.length > 0) {
    const { data: payments, error: paymentsError } = await supabase
      .from('Payment')
      .select('booking_id, psychologist_payout, status')
      .in('booking_id', thisMonthBookingIds);
    if (paymentsError) return res.status(500).json({ error: paymentsError.message });
    for (const p of payments) {
      if (p.status === 'paid') monthlyEarningsPaid += Number(p.psychologist_payout);
      else if (p.status === 'pending') monthlyEarningsPending += Number(p.psychologist_payout);
    }
  }

  // Appointments per month: last 7 months including the current one, counting any
  // live (non-cancelled/declined) booking regardless of status. Everything here uses
  // UTC consistently (both the key AND its label) -- schedule strings from Postgres are
  // UTC, so building the key from a *local* Date (new Date(y, m, 1)) shifted the whole
  // window by a day/month in timezones ahead of UTC (e.g. Philippines, UTC+8), silently
  // dropping the current month's bookings because the key no longer matched.
  const monthKeys = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    monthKeys.push({
      key: d.toISOString().slice(0, 7),
      label: d.toLocaleString('default', { month: 'short', timeZone: 'UTC' }),
    });
  }
  const monthCounts = Object.fromEntries(monthKeys.map((m) => [m.key, 0]));
  bookings
    .filter((b) => b.status !== 'cancelled' && b.status !== 'declined')
    .forEach((b) => {
      const key = b.schedule.slice(0, 7);
      if (key in monthCounts) monthCounts[key] += 1;
    });
  const appointmentsPerMonth = monthKeys.map((m) => ({ month: m.label, count: monthCounts[m.key] }));

  // Mood distribution: for each distinct resident with a confirmed booking here,
  // compare their two most recent Mood_Entry rows. Needs at least 2 entries to
  // classify at all -- a client with 0 or 1 entries is left out rather than guessed at.
  const clientIds = [...new Set(confirmedBookings.map((b) => b.resident_id))];
  let improving = 0;
  let stable = 0;
  let needsAttention = 0;

  if (clientIds.length > 0) {
    const { data: moodEntries, error: moodError } = await supabase
      .from('Mood_Entry')
      .select('user_id, mood_level, created_at')
      .in('user_id', clientIds)
      .order('created_at', { ascending: false });

    if (!moodError && moodEntries) {
      const latestTwoByUser = {};
      for (const entry of moodEntries) {
        if (!latestTwoByUser[entry.user_id]) latestTwoByUser[entry.user_id] = [];
        if (latestTwoByUser[entry.user_id].length < 2) latestTwoByUser[entry.user_id].push(entry.mood_level);
      }
      for (const clientId of clientIds) {
        const [latest, previous] = latestTwoByUser[clientId] || [];
        if (latest == null || previous == null) continue;
        if (latest > previous) improving += 1;
        else if (latest < previous) needsAttention += 1;
        else stable += 1;
      }
    }
  }

  const classifiedCount = improving + stable + needsAttention;

  res.json({
    today_sessions: todaysSessions.length,
    pending_requests: pendingRequests.length,
    completed_sessions: completedSessions.length,
    monthly_earnings_paid: monthlyEarningsPaid,
    monthly_earnings_pending: monthlyEarningsPending,
    appointments_per_month: appointmentsPerMonth,
    mood_distribution:
      classifiedCount > 0
        ? {
            improving: Math.round((improving / classifiedCount) * 100),
            stable: Math.round((stable / classifiedCount) * 100),
            needs_attention: Math.round((needsAttention / classifiedCount) * 100),
          }
        : null,
    todays_sessions_detail: todaysSessions.map((b) => ({
      booking_id: b.booking_id,
      resident_id: b.resident_id,
      schedule: b.schedule,
    })),
  });
});

// POST /bookings/:id/accept — confirms the request: consumes the reserved credit (if
// any) and creates the Payment. See db/booking_accept_decline.sql.
app.post('/bookings/:id/accept', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { data: psychologist, error: psychError } = await supabase
    .from('Psychologist')
    .select('psychologist_id')
    .eq('user_id', req.user.user_id)
    .single();

  if (psychError || !psychologist) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data, error } = await supabase.rpc('accept_booking_request', {
    p_booking_id: req.params.id,
    p_psychologist_id: psychologist.psychologist_id,
  });

  if (error) {
    if (error.message === 'BOOKING_NOT_FOUND') return res.status(404).json({ error: 'Booking not found' });
    if (error.message === 'NOT_YOUR_BOOKING') return res.status(403).json({ error: 'This is not your booking request' });
    if (error.message === 'BOOKING_NOT_PENDING') return res.status(409).json({ error: 'This request is no longer pending' });
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// POST /bookings/:id/decline — releases the reserved credit back to 'available' and
// frees up the slot for someone else to request. See db/booking_accept_decline.sql.
app.post('/bookings/:id/decline', requireAuth, requireRole('psychologist'), async (req, res) => {
  const { data: psychologist, error: psychError } = await supabase
    .from('Psychologist')
    .select('psychologist_id')
    .eq('user_id', req.user.user_id)
    .single();

  if (psychError || !psychologist) return res.status(404).json({ error: 'No psychologist profile found for this account' });

  const { data, error } = await supabase.rpc('decline_booking_request', {
    p_booking_id: req.params.id,
    p_psychologist_id: psychologist.psychologist_id,
  });

  if (error) {
    if (error.message === 'BOOKING_NOT_FOUND') return res.status(404).json({ error: 'Booking not found' });
    if (error.message === 'NOT_YOUR_BOOKING') return res.status(403).json({ error: 'This is not your booking request' });
    if (error.message === 'BOOKING_NOT_PENDING') return res.status(409).json({ error: 'This request is no longer pending' });
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// GET /bookings/:id/messages and POST /bookings/:id/messages — Anonymous Chat.
// Only the resident and psychologist on this specific booking can read or post;
// responses never include a user id or name, only sender_role, so identity masking
// can't be broken by an API consumer joining in extra fields later.
app.get('/bookings/:id/messages', requireAuth, async (req, res) => {
  const role = await getBookingParticipantRole(req.params.id, req.user);
  if (!role) return res.status(403).json({ error: 'You are not part of this conversation' });

  const { data, error } = await supabase
    .from('Message')
    .select('message_id, sender_role, body, created_at')
    .eq('booking_id', req.params.id)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/bookings/:id/messages', requireAuth, async (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'body is required' });

  const role = await getBookingParticipantRole(req.params.id, req.user);
  if (!role) return res.status(403).json({ error: 'You are not part of this conversation' });

  const { data, error } = await supabase
    .from('Message')
    .insert([{ booking_id: req.params.id, sender_role: role, body: body.trim() }])
    .select('message_id, sender_role, body, created_at');

  if (error) return res.status(500).json({ error: error.message });

  const message = data[0];
  io.to(`booking-${req.params.id}`).emit('new-message', { booking_id: Number(req.params.id), ...message });

  res.status(201).json(message);
});

// GET /care-credits/reconciliation?barangay_id=3 (barangay_id optional — omit for every barangay)
//
// Verifies the Care_Credit ledger actually adds up per barangay: total issued must equal
// available + used, and every credit marked 'used' must be linked to exactly one Booking.
// An "orphaned" used credit (used but no booking references it) means the ledger and the
// bookings table drifted apart — the exact failure mode a racy or non-atomic claim
// could cause; see db/create_booking_transaction.sql for how claiming is made atomic.
app.get('/care-credits/reconciliation', async (req, res) => {
  const { barangay_id } = req.query;

  let query = supabase.from('Care_Credit').select('credit_id, barangay_id, amount, status');
  if (barangay_id) query = query.eq('barangay_id', barangay_id);

  const { data: credits, error: creditsError } = await query;
  if (creditsError) return res.status(500).json({ error: creditsError.message });

  const usedCreditIds = credits.filter((c) => c.status === 'used').map((c) => c.credit_id);

  let linkedIds = new Set();
  if (usedCreditIds.length > 0) {
    const { data: linkedBookings, error: bookingsError } = await supabase
      .from('Booking')
      .select('care_credit_id')
      .in('care_credit_id', usedCreditIds);

    if (bookingsError) return res.status(500).json({ error: bookingsError.message });
    linkedIds = new Set(linkedBookings.map((b) => b.care_credit_id));
  }

  const byBarangay = {};
  for (const c of credits) {
    if (!byBarangay[c.barangay_id]) {
      byBarangay[c.barangay_id] = {
        barangay_id: c.barangay_id,
        total_issued: 0,
        total_amount_issued: 0,
        available: 0,
        amount_available: 0,
        reserved: 0,
        amount_reserved: 0,
        used: 0,
        amount_used: 0,
        other_status: 0,
        orphaned_used_credits: 0,
      };
    }
    const b = byBarangay[c.barangay_id];
    b.total_issued += 1;
    b.total_amount_issued += Number(c.amount);
    if (c.status === 'available') {
      b.available += 1;
      b.amount_available += Number(c.amount);
    } else if (c.status === 'reserved') {
      // Held against a pending Appointment Request — not yet spent, not free to reuse.
      // See db/booking_accept_decline.sql: accept turns this into 'used', decline
      // releases it back to 'available'.
      b.reserved += 1;
      b.amount_reserved += Number(c.amount);
    } else if (c.status === 'used') {
      b.used += 1;
      b.amount_used += Number(c.amount);
      if (!linkedIds.has(c.credit_id)) b.orphaned_used_credits += 1;
    } else {
      b.other_status += 1;
    }
  }

  const results = Object.values(byBarangay).map((b) => ({
    ...b,
    reconciled:
      b.other_status === 0 &&
      b.orphaned_used_credits === 0 &&
      b.available + b.reserved + b.used === b.total_issued,
  }));

  if (barangay_id) {
    return res.json(
      results[0] || {
        barangay_id: Number(barangay_id),
        total_issued: 0,
        total_amount_issued: 0,
        available: 0,
        amount_available: 0,
        reserved: 0,
        amount_reserved: 0,
        used: 0,
        amount_used: 0,
        other_status: 0,
        orphaned_used_credits: 0,
        reconciled: true,
      }
    );
  }
  res.json(results);
});

// POST /care-credits/allocate — issues new Care Credits against the barangay's Budget.
// Two modes, mutually exclusive:
//   { resident_id, amount } — issue one credit to a single resident. barangay_id is
//     always derived from that resident's own User.barangay_id, never taken from the
//     request body, so a credit can never be issued under a barangay the recipient
//     doesn't actually belong to (the segregation guarantee this module is named for).
//   { barangay_id, amount } — issue one credit of `amount` to every resident currently
//     registered under that barangay (an LGU funding a round of credits for its own residents).
// Both modes run through allocate_care_credit_single/allocate_care_credits_bulk (see
// db/budget_and_subscription.sql), which reject the request if the barangay's
// subscription isn't active or its budget can't cover the amount -- see Resource &
// Budget Management / Subscription Monitoring.
app.post('/care-credits/allocate', requireAuth, requireRole('admin'), async (req, res) => {
  const { barangay_id, resident_id, amount } = req.body;

  const numericAmount = Number(amount);
  if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  if (!barangay_id && !resident_id) {
    return res.status(400).json({
      error: 'either barangay_id (fund every resident there) or resident_id (fund just one) is required',
    });
  }

  const handleAllocationError = (error, res) => {
    if (error.message === 'RESIDENT_NOT_FOUND') return res.status(404).json({ error: 'Resident not found' });
    if (error.message === 'SUBSCRIPTION_INACTIVE') return res.status(400).json({ error: "This barangay's subscription is not active" });
    if (error.message === 'NO_BUDGET_FOR_BARANGAY') return res.status(400).json({ error: 'This barangay has no funded budget yet' });
    if (error.message === 'INSUFFICIENT_BUDGET') return res.status(400).json({ error: 'Insufficient remaining budget for this barangay' });
    return res.status(500).json({ error: error.message });
  };

  if (resident_id) {
    const { data, error } = await supabase.rpc('allocate_care_credit_single', {
      p_resident_id: resident_id,
      p_amount: numericAmount,
    });

    if (error) return handleAllocationError(error, res);
    return res.status(201).json({ credits_issued: 1, total_amount: numericAmount, credits: [data] });
  }

  const { data: barangay, error: barangayError } = await supabase
    .from('Barangay')
    .select('barangay_id')
    .eq('barangay_id', barangay_id)
    .single();

  if (barangayError || !barangay) return res.status(404).json({ error: 'Barangay not found' });

  const { data, error } = await supabase.rpc('allocate_care_credits_bulk', {
    p_barangay_id: barangay_id,
    p_amount: numericAmount,
  });

  if (error) return handleAllocationError(error, res);
  res.status(201).json(data);
});

// GET /admin/subscriptions — every barangay's subscription status (barangays with no
// row yet default to 'inactive', which is also what blocks funding/allocation for them).
app.get('/admin/subscriptions', requireAuth, requireRole('admin'), async (req, res) => {
  const { data: barangays, error: bError } = await supabase.from('Barangay').select('barangay_id, name, city');
  if (bError) return res.status(500).json({ error: bError.message });

  const { data: subs, error: sError } = await supabase.from('Subscription').select('*');
  if (sError) return res.status(500).json({ error: sError.message });

  const subByBarangay = Object.fromEntries(subs.map((s) => [s.barangay_id, s]));

  res.json(
    barangays.map((barangay) => {
      const sub = subByBarangay[barangay.barangay_id];
      return {
        barangay_id: barangay.barangay_id,
        name: barangay.name,
        city: barangay.city,
        plan: sub?.plan || null,
        status: sub?.status || 'inactive',
        renewed_at: sub?.renewed_at || null,
      };
    })
  );
});

// POST /admin/subscriptions/:barangayId — body: { plan, status }. Upserts the
// barangay's subscription; setting status to 'active' stamps renewed_at.
app.post('/admin/subscriptions/:barangayId', requireAuth, requireRole('admin'), async (req, res) => {
  const { plan, status } = req.body;
  const validStatuses = ['active', 'inactive', 'past_due', 'cancelled'];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
  }

  const { data: barangay, error: bError } = await supabase
    .from('Barangay')
    .select('barangay_id')
    .eq('barangay_id', req.params.barangayId)
    .single();

  if (bError || !barangay) return res.status(404).json({ error: 'Barangay not found' });

  const { data, error } = await supabase
    .from('Subscription')
    .upsert(
      [{
        barangay_id: req.params.barangayId,
        plan: plan || 'basic',
        status,
        renewed_at: status === 'active' ? new Date().toISOString() : null,
      }],
      { onConflict: 'barangay_id' }
    )
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data[0]);
});

// GET /admin/budgets — every barangay's funded/spent/remaining totals.
app.get('/admin/budgets', requireAuth, requireRole('admin'), async (req, res) => {
  const { data: barangays, error: bError } = await supabase.from('Barangay').select('barangay_id, name, city');
  if (bError) return res.status(500).json({ error: bError.message });

  const { data: budgets, error: budError } = await supabase.from('Budget').select('*');
  if (budError) return res.status(500).json({ error: budError.message });

  const budgetByBarangay = Object.fromEntries(budgets.map((b) => [b.barangay_id, b]));

  res.json(
    barangays.map((barangay) => {
      const budget = budgetByBarangay[barangay.barangay_id];
      const totalFunded = budget ? Number(budget.total_funded) : 0;
      const totalSpent = budget ? Number(budget.total_spent) : 0;
      return {
        barangay_id: barangay.barangay_id,
        name: barangay.name,
        city: barangay.city,
        total_funded: totalFunded,
        total_spent: totalSpent,
        remaining: totalFunded - totalSpent,
      };
    })
  );
});

// POST /admin/budgets/:barangayId/fund — body: { amount }. Blocked unless the
// barangay's subscription is active — see db/budget_and_subscription.sql.
app.post('/admin/budgets/:barangayId/fund', requireAuth, requireRole('admin'), async (req, res) => {
  const { amount } = req.body;
  const numericAmount = Number(amount);
  if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  const { data, error } = await supabase.rpc('fund_barangay_budget', {
    p_barangay_id: req.params.barangayId,
    p_amount: numericAmount,
  });

  if (error) {
    if (error.message === 'SUBSCRIPTION_INACTIVE') {
      return res.status(400).json({ error: "This barangay's subscription is not active" });
    }
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json(data);
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

app.get('/group-sessions', async (req, res) => {
  const { data, error } = await supabase
    .from('Group_Session')
    .select('*, Psychologist(psychologist_id, User(name))')
    .order('schedule', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Reuses the same JWT-signing logic as /jitsi-token, but keyed by group_session_id
app.get('/group-session-token/:groupSessionId', (req, res) => {
  const { groupSessionId } = req.params;
  const { name, role } = req.query;

  const roomName = `openup-group-${groupSessionId}`;
  const isModerator = role === 'psychologist';

  const payload = {
    aud: 'jitsi',
    iss: 'chat',
    sub: process.env.JAAS_APP_ID,
    room: roomName,
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
    context: {
      user: { name: name || 'Guest', moderator: isModerator },
      features: { livestreaming: false, recording: false, transcription: false },
    },
  };

  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    header: { kid: process.env.JAAS_KEY_ID },
  });

  res.json({ token, room: `${process.env.JAAS_APP_ID}/${roomName}` });
});

// POST /auth/signup
app.post('/auth/signup', async (req, res) => {
  const { name, email, password, role, barangay_id, license_no, credentials, session_price } = req.body;

  if (!name || !email || !password || !role || !barangay_id) {
    return res.status(400).json({ error: 'name, email, password, role, and barangay_id are required' });
  }

  // Psychologist applicants need these up front — an admin can't verify a license
  // number that was never collected, and Psychologist.credentials/session_price
  // are NOT NULL columns anyway.
  if (role === 'psychologist' && (!license_no || !credentials || !session_price)) {
    return res.status(400).json({ error: 'license_no, credentials, and session_price are required for psychologists' });
  }

  // Check if email already exists
  const { data: existing } = await supabase
    .from('User')
    .select('user_id')
    .eq('email', email)
    .limit(1);

  if (existing && existing.length > 0) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from('User')
    .insert([{
      name,
      email,
      password: hashedPassword,
      role,
      barangay_id,
      status: 'active',
    }])
    .select('user_id, name, email, role, barangay_id, status'); // never return the password

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const user = data[0];

  if (role === 'psychologist') {
    // Unverified and unbookable until an admin approves it — see POST /admin/psychologists/:id/verify
    const { error: psychError } = await supabase
      .from('Psychologist')
      .insert([{
        user_id: user.user_id,
        license_no,
        credentials,
        session_price: Number(session_price),
        specialties: [],
        is_verified: false,
        is_available: false,
      }]);

    if (psychError) {
      // Roll back the User row rather than leaving a psychologist account with no profile
      await supabase.from('User').delete().eq('user_id', user.user_id);
      return res.status(500).json({ error: psychError.message });
    }
  }

  res.status(201).json(user);
});

// POST /auth/login
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const { data: users, error } = await supabase
    .from('User')
    .select('*')
    .eq('email', email)
    .limit(1);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (!users || users.length === 0) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const user = users[0];
  const passwordMatches = await bcrypt.compare(password, user.password);

  if (!passwordMatches) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign(
    { user_id: user.user_id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    user: {
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      role: user.role,
      barangay_id: user.barangay_id,
    },
  });
});

// GET /auth/me — round-trips the stored token: confirms it's still valid and returns
// who it belongs to. The frontend calls this on app load to detect an expired/invalid
// stored token instead of silently trusting whatever's in localStorage forever.
app.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

const CRISIS_PHRASES = [
  'kill myself', 'want to die', 'end my life', 'better off without me',
  'no reason to live', "can't go on", 'suicide', 'hurting myself',
  'self harm', 'end it all', "don't want to be here anymore",
  'no point in living',
];

const emotionReflections = {
  sadness: "It sounds like you're carrying something heavy right now. These feelings are real, and they matter.",
  fear: "It sounds like something is weighing on you and making things feel uncertain or unsafe.",
  anger: "It sounds like you're dealing with real frustration right now, and that's valid.",
  joy: "It's good to hear some lightness in what you shared today.",
  surprise: "It sounds like something unexpected has been on your mind.",
  disgust: "It sounds like something's been sitting heavy and uncomfortable with you.",
  neutral: "Thanks for sharing what's on your mind today.",
};

function detectCrisisRisk(transcript) {
  const lower = transcript.toLowerCase();
  return CRISIS_PHRASES.some((phrase) => lower.includes(phrase));
}

async function generateLLMReflection(transcript) {
  const prompt = `Write a short, warm, two-sentence reflection acknowledging the feelings in this personal journal entry. Do not give advice. Do not diagnose. Just reflect what they seem to be feeling: "${transcript}"`;

  const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'user', content: prompt }],
      // gpt-oss emits a chain-of-thought "reasoning" field before its final "content" —
      // too small a budget truncates the response before content is ever produced.
      max_tokens: 400,
    }),
  });

  const data = await res.json();
  const generated = data?.choices?.[0]?.message?.content;

  if (!res.ok || !generated || generated.trim().length < 5) {
    throw new Error('LLM reflection unavailable');
  }

  return generated.trim();
}

// POST /voice-journal — audio upload → Whisper transcription → emotion analysis → crisis check → save
app.post('/voice-journal', upload.single('audio'), async (req, res) => {
  const { user_id, duration_seconds } = req.body;
  const audioFile = req.file;

  if (!user_id || !audioFile) {
    return res.status(400).json({ error: 'user_id and an audio file are required' });
  }

  try {
    // Step 1: Transcribe with Whisper via HuggingFace (free tier)
    const whisperRes = await fetch(
      'https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3-turbo',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          'Content-Type': 'audio/webm',
        },
        body: audioFile.buffer,
      }
    );

    const whisperData = await whisperRes.json();

    if (!whisperRes.ok) {
      // Free-tier models "cold start" — first request often needs to wait ~20s while it loads
      if (whisperData.error && whisperData.error.includes('loading')) {
        return res.status(503).json({ error: 'Model is warming up, try again in ~20 seconds.' });
      }
      return res.status(500).json({ error: 'Transcription failed', detail: whisperData });
    }

    const transcript = whisperData.text;

    // Step 2: Emotion analysis with HuggingFace
    const emotionRes = await fetch(
      'https://router.huggingface.co/hf-inference/models/j-hartmann/emotion-english-distilroberta-base',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: transcript }),
      }
    );

    const emotionData = await emotionRes.json();
    const sorted = Array.isArray(emotionData?.[0])
      ? [...emotionData[0]].sort((a, b) => b.score - a.score)
      : [];

    // "Content emotion" — from the words themselves.
    // A second "tone emotion" pass (pitch/prosody from the raw audio) was planned here,
    // but no HuggingFace-hosted speech-emotion-recognition model currently has an active
    // inference provider (verified against several candidates) — tone_result stays null
    // until a stable API for that becomes available.
    const contentEmotion = sorted[0]?.label || 'unknown';
    const contentIndicators = sorted.slice(0, 2).map((e) => e.label);

    // Step 3: Crisis check (deterministic — never left to the LLM) + reflection generation
    const isCrisis = detectCrisisRisk(transcript);

    let reflectionBase;
    try {
      reflectionBase = await generateLLMReflection(transcript);
    } catch {
      reflectionBase = emotionReflections[contentEmotion.toLowerCase()] || emotionReflections.neutral;
    }

    const wellnessSuggestion = isCrisis
      ? "Please don't face this alone — connecting with a licensed psychologist can help."
      : 'Consider a short breathing exercise, or reaching out to someone you trust today.';

    // Step 4: Upload the audio to storage now that the user has confirmed they want to keep it
    const audioPath = `${user_id}/${Date.now()}.webm`;
    const { error: uploadError } = await supabase.storage
      .from('voice-journal-audio')
      .upload(audioPath, audioFile.buffer, { contentType: 'audio/webm' });

    if (uploadError) {
      return res.status(500).json({ error: uploadError.message });
    }

    // Step 5: Save to Supabase
    const { data, error } = await supabase
      .from('Voice_Journal')
      .insert([{
        user_id,
        transcript,
        emotion_result: contentEmotion,
        risk_flag: isCrisis,
        audio_path: audioPath,
        duration_seconds: duration_seconds ? Number(duration_seconds) : null,
      }])
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({
      ...data[0],
      emotional_summary: reflectionBase,
      wellness_suggestion: wellnessSuggestion,
      content_indicators: contentIndicators,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/voice-journal/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const { data, error } = await supabase
    .from('Voice_Journal')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/crisis-match', async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  // Find an available, verified psychologist
  const { data: available, error: findError } = await supabase
    .from('Psychologist')
    .select('psychologist_id, session_price')
    .eq('is_verified', true)
    .eq('is_available', true)
    .limit(1);

  if (findError) return res.status(500).json({ error: findError.message });

  if (!available || available.length === 0) {
    // No one free — add to the priority queue instead
    const { data: queued, error: queueError } = await supabase
      .from('Crisis_Requests')
      .insert([{ user_id, status: 'queued' }])
      .select();

    if (queueError) return res.status(500).json({ error: queueError.message });

    return res.json({ matched: false, queued: queued[0] });
  }

  const psychologistId = available[0].psychologist_id;

  // Same atomic credit-claim + booking + payment transaction as /bookings — see
  // db/create_booking_transaction.sql — so a crisis match can't leave an orphaned
  // booking or a stranded credit either. p_auto_confirm: true skips the pending/accept
  // step regular bookings now go through — an active crisis shouldn't wait on approval.
  const { data, error } = await supabase.rpc('create_booking_transaction', {
    p_resident_id: user_id,
    p_psychologist_id: psychologistId,
    p_schedule: new Date().toISOString(),
    p_session_type: 'crisis',
    p_auto_confirm: true,
  });

  if (error) return res.status(500).json({ error: error.message });

  // Mark the psychologist as no longer immediately available
  await supabase.from('Psychologist').update({ is_available: false }).eq('psychologist_id', psychologistId);

  res.json({ matched: true, booking: data.booking });
});

const COMPANION_SYSTEM_PROMPT = `You are a warm, supportive, non-clinical companion inside a mental wellness app called OpenUp for Cebu City residents. Respond in 2-4 sentences. Offer a simple grounding or breathing exercise if it fits naturally. Never diagnose, never use clinical labels, never claim to be a licensed professional. Match the language the person used (Bisaya, Filipino, or English) as best you can. Gently encourage reaching out to a licensed psychologist for anything serious, without being pushy or repetitive. Never invent or state specific phone numbers, hotline numbers, or emergency contact details under any circumstance — you do not actually know them; the app shows verified local crisis resources separately. If someone expresses thoughts of self-harm or suicide, respond with calm, direct empathy and gently point them toward the app's in-app option to connect with a licensed psychologist, without listing any phone numbers yourself.`;

app.post('/crisis-companion/chat', async (req, res) => {
  const { message, history } = req.body;

  if (!message) return res.status(400).json({ error: 'message is required' });

  const isCrisis = detectCrisisRisk(message);

  // `history` already ends with this same user message (the client appends it before sending),
  // so it's passed through as-is rather than appending `message` a second time.
  const recentHistory = (history || []).slice(-6).map((h) => ({
    role: h.role === 'user' ? 'user' : 'assistant',
    content: h.content,
  }));

  try {
    const llmRes = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: [
          { role: 'system', content: COMPANION_SYSTEM_PROMPT },
          ...recentHistory,
        ],
        // gpt-oss's internal "reasoning" chain runs noticeably longer on sensitive/crisis
        // content before producing a final answer — too small a budget truncates the reply
        // before any content is ever emitted (same issue as the Voice Journal reflection).
        max_tokens: 900,
      }),
    });
    const data = await llmRes.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    res.json({
      reply: reply || "I'm here with you. Can you tell me a bit more about what's going on?",
      crisis_detected: isCrisis,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/mood-entries', async (req, res) => {
  const { user_id, mood_level } = req.body;
  if (!user_id || !mood_level) {
    return res.status(400).json({ error: 'user_id and mood_level are required' });
  }

  const today = new Date().toISOString().split('T')[0];

  // Check if today's entry already exists — update it instead of creating a duplicate
  const { data: existing } = await supabase
    .from('Mood_Entry')
    .select('mood_id')
    .eq('user_id', user_id)
    .eq('entry_date', today)
    .limit(1);

  if (existing && existing.length > 0) {
    const { data, error } = await supabase
      .from('Mood_Entry')
      .update({ mood_level })
      .eq('mood_id', existing[0].mood_id)
      .select();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data[0]);
  }

  const { data, error } = await supabase
    .from('Mood_Entry')
    .insert([{ user_id, mood_level, entry_date: today }])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data[0]);
});

app.get('/mood-entries/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const { data, error } = await supabase
    .from('Mood_Entry')
    .select('*')
    .eq('user_id', userId)
    .order('entry_date', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

const ASSESSMENT_SECTIONS = {
  mood: ['A1', 'A2', 'A3', 'A4', 'A5'],
  anxiety: ['B1', 'B2', 'B3', 'B4', 'B5'],
  stress: ['C1', 'C2', 'C3', 'C4', 'C5'],
};

const BAND_RANK = { low: 0, moderate: 1, elevated: 2 };

function bandForScore(score) {
  if (score >= 10) return 'elevated';
  if (score >= 5) return 'moderate';
  return 'low';
}

// POST /assessment — score the 4-point Mood/Anxiety/Stress sections, plus the
// D1 safety-check item, which is scored separately and never averaged into
// the wellness bands.
app.post('/assessment', async (req, res) => {
  const { user_id, answers } = req.body;

  if (!user_id || !answers) {
    return res.status(400).json({ error: 'user_id and answers are required' });
  }

  const sumSection = (keys) => keys.reduce((total, key) => total + (Number(answers[key]) || 0), 0);

  const moodScore = sumSection(ASSESSMENT_SECTIONS.mood);
  const anxietyScore = sumSection(ASSESSMENT_SECTIONS.anxiety);
  const stressScore = sumSection(ASSESSMENT_SECTIONS.stress);
  const safetyScore = Number(answers.D1) || 0;
  const safetyFlag = safetyScore > 0;

  const moodBand = bandForScore(moodScore);
  const anxietyBand = bandForScore(anxietyScore);
  const stressBand = bandForScore(stressScore);

  // Highest band wins — a spike in one section shouldn't be masked by lower scores elsewhere.
  const overallBand = [moodBand, anxietyBand, stressBand].reduce(
    (worst, band) => (BAND_RANK[band] > BAND_RANK[worst] ? band : worst),
    'low'
  );

  const { data, error } = await supabase
    .from('Assessment_Result')
    .insert([{
      user_id,
      mood_score: moodScore,
      anxiety_score: anxietyScore,
      stress_score: stressScore,
      overall_band: overallBand,
      safety_flag: safetyFlag,
      safety_score: safetyScore,
    }])
    .select();

  if (error) return res.status(500).json({ error: error.message });

  res.status(201).json({
    ...data[0],
    sections: {
      mood: { score: moodScore, band: moodBand },
      anxiety: { score: anxietyScore, band: anxietyBand },
      stress: { score: stressScore, band: stressBand },
    },
  });
});

const MOOD_LABELS = { 1: 'Low', 2: 'Down', 3: 'Okay', 4: 'Good', 5: 'Calm' };
const MOOD_EMOJI = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😌' };

const INSIGHT_COLORS = {
  streak: '#5DCAA5',
  trend: '#FAC775',
  mood: '#F0997B',
  locked: '#9CA3AF',
  voice: '#B8A6E8',
};

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

function startOfWeek(d) {
  // Monday-start week
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

const STOPWORDS = new Set([
  'this', 'that', 'with', 'have', 'just', 'like', 'been', 'about', 'really',
  'know', 'feel', 'feeling', 'felt', 'think', 'lately', 'today', 'still',
  'even', 'when', 'what', 'they', 'them', 'because', 'from', 'want', 'going',
  'there', 'here', 'were', 'would', 'could', 'should', 'their', 'your',
  // contraction remnants left over once the keyword regex strips apostrophes
  // (e.g. "don't" -> "dont") — without these, the most common "word" ends up
  // being a stripped contraction rather than an actual theme
  'dont', 'doesnt', 'cant', 'wont', 'isnt', 'wasnt', 'arent', 'couldnt',
  'wouldnt', 'shouldnt', 'didnt', 'hasnt', 'havent', 'youre', 'theyre',
  'weve', 'thats', 'whats',
]);

const KEYWORD_FOLLOWUPS = {
  sleep: 'Worth noticing — want to check in on your sleep?',
  tired: 'Worth noticing — want to check in on your sleep?',
  insomnia: 'Worth noticing — want to check in on your sleep?',
  work: 'Worth noticing — want to check in on your workload?',
  exam: 'Worth noticing — want to check in on school stress?',
  deadline: 'Worth noticing — want to check in on your workload?',
  stress: 'Worth noticing — want to check in on what\'s been stressful?',
  lonely: 'Worth noticing — want to check in on your support system?',
  alone: 'Worth noticing — want to check in on your support system?',
  money: 'Worth noticing — want to check in on financial stress?',
  family: 'Worth noticing — want to check in on things at home?',
};

app.get('/insights/user/:userId', async (req, res) => {
  const { userId } = req.params;
  const cards = [];

  const { data: moodEntries, error: moodError } = await supabase
    .from('Mood_Entry')
    .select('mood_level, entry_date')
    .eq('user_id', userId)
    .order('entry_date', { ascending: true });

  if (moodError) return res.status(500).json({ error: moodError.message });

  const entriesByDate = new Map((moodEntries || []).map((e) => [e.entry_date, e.mood_level]));

  // --- Card 1: Streak ---
  if (moodEntries && moodEntries.length > 0) {
    // Current streak: consecutive days ending today
    let currentStreak = 0;
    const cursor = new Date();
    while (entriesByDate.has(toDateStr(cursor))) {
      currentStreak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    // Longest streak ever, scanning all logged dates
    const sortedDates = [...entriesByDate.keys()].sort();
    let longestStreak = 0;
    let running = 0;
    let prevDate = null;
    for (const dateStr of sortedDates) {
      const d = new Date(dateStr);
      if (prevDate) {
        const diffDays = Math.round((d - prevDate) / 86400000);
        running = diffDays === 1 ? running + 1 : 1;
      } else {
        running = 1;
      }
      longestStreak = Math.max(longestStreak, running);
      prevDate = d;
    }

    if (currentStreak > 0) {
      cards.push({
        type: 'streak',
        label: 'Streak',
        icon: '🔥',
        accentColor: INSIGHT_COLORS.streak,
        title: `${currentStreak}-day check-in streak`,
        subtext: currentStreak >= longestStreak
          ? 'Your longest one yet.'
          : `Best so far: ${longestStreak} days.`,
      });
    }
  }

  // --- Weekly boundaries ---
  const thisWeekStart = startOfWeek(new Date());
  const prevWeekStart = new Date(thisWeekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekEnd = new Date(thisWeekStart);
  prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);

  const thisWeekEntries = (moodEntries || []).filter((e) => new Date(e.entry_date) >= thisWeekStart);
  const prevWeekEntries = (moodEntries || []).filter(
    (e) => new Date(e.entry_date) >= prevWeekStart && new Date(e.entry_date) <= prevWeekEnd
  );

  // --- Card 2: Weekly trend ---
  if (thisWeekEntries.length > 0 && prevWeekEntries.length > 0) {
    const avg = (arr) => arr.reduce((sum, e) => sum + e.mood_level, 0) / arr.length;
    const thisAvg = avg(thisWeekEntries);
    const prevAvg = avg(prevWeekEntries);
    const delta = thisAvg - prevAvg;

    let title;
    let verb;
    if (delta > 0.3) {
      title = 'Calmer than last week';
      verb = 'improved';
    } else if (delta < -0.3) {
      title = 'A bit tougher than last week';
      verb = 'dipped';
    } else {
      title = 'About the same as last week';
      verb = 'stayed steady';
    }

    cards.push({
      type: 'trend',
      label: 'Weekly Trend',
      icon: '📈',
      accentColor: INSIGHT_COLORS.trend,
      title,
      subtext: `Your average mood ${verb} compared to the week before.`,
    });
  }

  // --- Card 3: Most common mood this week ---
  if (thisWeekEntries.length > 0) {
    const counts = {};
    thisWeekEntries.forEach((e) => {
      counts[e.mood_level] = (counts[e.mood_level] || 0) + 1;
    });
    const [modeLevel, modeCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

    cards.push({
      type: 'mood',
      label: 'Top Mood',
      icon: MOOD_EMOJI[modeLevel],
      accentColor: INSIGHT_COLORS.mood,
      title: `"${MOOD_LABELS[modeLevel]}" was your top mood`,
      subtext: `Logged ${modeCount} out of ${thisWeekEntries.length} days this week.`,
    });
  }

  // --- Card 4: Day-of-week pattern (locked until 3+ weeks of history) ---
  if (moodEntries && moodEntries.length > 0) {
    const earliestDate = new Date(moodEntries[0].entry_date);
    const daysOfHistory = Math.floor((new Date() - earliestDate) / 86400000);

    if (daysOfHistory < 21) {
      cards.push({
        type: 'locked',
        label: 'Day Pattern',
        icon: '🔒',
        accentColor: INSIGHT_COLORS.locked,
        title: 'Unlocks after 3 weeks',
        subtext: 'Keep checking in — day-of-week patterns need more history to be reliable.',
      });
    } else {
      const last21 = moodEntries.filter((e) => new Date(e.entry_date) >= new Date(Date.now() - 21 * 86400000));
      const byWeekday = {};
      last21.forEach((e) => {
        const weekday = new Date(e.entry_date).getDay();
        if (!byWeekday[weekday]) byWeekday[weekday] = [];
        byWeekday[weekday].push(e.mood_level);
      });

      const overallAvg = last21.reduce((sum, e) => sum + e.mood_level, 0) / last21.length;
      const weekdayNames = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

      let lowestWeekday = null;
      let lowestAvg = Infinity;
      Object.entries(byWeekday).forEach(([weekday, levels]) => {
        if (levels.length < 2) return; // need at least 2 occurrences to call it a pattern
        const avg = levels.reduce((s, v) => s + v, 0) / levels.length;
        if (avg < lowestAvg) {
          lowestAvg = avg;
          lowestWeekday = weekday;
        }
      });

      if (lowestWeekday !== null && lowestAvg < overallAvg - 0.4) {
        cards.push({
          type: 'pattern',
          label: 'Day Pattern',
          icon: '📅',
          accentColor: INSIGHT_COLORS.streak,
          title: `${weekdayNames[lowestWeekday]} have been harder lately`,
          subtext: 'Based on your average mood by day of the week, over the last 3+ weeks.',
        });
      } else {
        cards.push({
          type: 'pattern',
          label: 'Day Pattern',
          icon: '📅',
          accentColor: INSIGHT_COLORS.streak,
          title: 'No strong day pattern yet',
          subtext: 'Your mood looks fairly consistent across the week so far.',
        });
      }
    }
  }

  // --- Card 5: Voice journal keyword correlation ---
  const { data: journalEntries } = await supabase
    .from('Voice_Journal')
    .select('transcript, emotion_result, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const thisWeekJournal = (journalEntries || []).filter(
    (j) => new Date(j.created_at) >= thisWeekStart
  );

  if (thisWeekJournal.length >= 2) {
    const wordCounts = {};
    thisWeekJournal.forEach((j) => {
      const words = (j.transcript || '')
        .toLowerCase()
        .replace(/[^a-z\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
      words.forEach((w) => {
        wordCounts[w] = (wordCounts[w] || 0) + 1;
      });
    });

    const topEntry = Object.entries(wordCounts)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])[0];

    if (topEntry) {
      const [keyword, count] = topEntry;
      const followup = KEYWORD_FOLLOWUPS[keyword] || 'Worth noticing — want to explore this further?';

      cards.push({
        type: 'voice',
        label: 'Voice Journal',
        icon: '🎙️',
        accentColor: INSIGHT_COLORS.voice,
        title: `"${keyword}" came up ${count} times`,
        subtext: followup,
      });
    }
  }

  res.json(cards);
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});