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

app.get('/barangays', async (req, res) => {
  const { data, error } = await supabase.from('Barangay').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/bookings/user/:userId', async (req, res) => {
  const { userId } = req.params;

  const { data, error } = await supabase
    .from('Booking')
    .select('*, Psychologist(psychologist_id, license_no, User(name))')
    .eq('resident_id', userId)
    .order('schedule', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/psychologists', async (req, res) => {
  const { data, error } = await supabase
    .from('Psychologist')
    .select('psychologist_id, license_no, is_verified, User(name)')
    .eq('is_verified', true);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
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
  const { name, email, password, role, barangay_id, status } = req.body;

  if (!name || !email || !password || !role || !barangay_id) {
    return res.status(400).json({ error: 'name, email, password, role, and barangay_id are required' });
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
      status: status || 'active',
    }])
    .select('user_id, name, email, role, barangay_id, status'); // never return the password

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json(data[0]);
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
  const { user_id } = req.body;
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

    // Step 4: Save to Supabase
    const { data, error } = await supabase
      .from('Voice_Journal')
      .insert([{ user_id, transcript, emotion_result: contentEmotion, risk_flag: isCrisis }])
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
    .select('psychologist_id')
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

  // Check for an available care credit, same logic as your regular booking route
  const { data: credits } = await supabase
    .from('Care_Credit')
    .select('*')
    .eq('resident_id', user_id)
    .eq('status', 'available')
    .limit(1);

  const careCredit = credits && credits.length > 0 ? credits[0] : null;

  const { data: bookingData, error: bookingError } = await supabase
    .from('Booking')
    .insert([{
      resident_id: user_id,
      psychologist_id: psychologistId,
      schedule: new Date().toISOString(),
      status: 'confirmed',
      session_type: 'crisis',
      care_credit_id: careCredit ? careCredit.credit_id : null,
    }])
    .select();

  if (bookingError) return res.status(500).json({ error: bookingError.message });
  const booking = bookingData[0];

  if (careCredit) {
    await supabase.from('Care_Credit').update({ status: 'used' }).eq('credit_id', careCredit.credit_id);
  }

  await supabase.from('Payment').insert([{
    booking_id: booking.booking_id,
    amount: 1000,
    status: careCredit ? 'paid' : 'pending',
  }]);

  // Mark the psychologist as no longer immediately available
  await supabase.from('Psychologist').update({ is_available: false }).eq('psychologist_id', psychologistId);

  res.json({ matched: true, booking });
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

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});