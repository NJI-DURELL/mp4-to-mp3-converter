const express = require('express');
const cors = require('cors');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = process.env.ALLOWED_ORIGIN
  ? [process.env.ALLOWED_ORIGIN, 'http://localhost:4200']
  : ['http://localhost:4200'];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json());

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const OUTPUTS_DIR = path.join(__dirname, 'outputs');

[UPLOADS_DIR, OUTPUTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  },
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB
});

// SSE progress tracking
const jobs = new Map();

app.get('/api/progress/:jobId', (req, res) => {
  const { jobId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  if (!jobs.has(jobId)) {
    send({ type: 'error', message: 'Job not found' });
    return res.end();
  }

  jobs.get(jobId).listeners.push(send);

  req.on('close', () => {
    const job = jobs.get(jobId);
    if (job) {
      job.listeners = job.listeners.filter(l => l !== send);
    }
  });
});

app.post('/api/convert', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file uploaded' });
  }

  const jobId = uuidv4();
  const inputPath = req.file.path;
  const originalName = path.basename(req.file.originalname, path.extname(req.file.originalname));
  const outputFilename = `${originalName}_${jobId}.mp3`;
  const outputPath = path.join(OUTPUTS_DIR, outputFilename);

  const quality = req.body.quality || 'ultra';
  const qualitySettings = {
    ultra: { audioBitrate: '320k', audioFrequency: 44100, audioChannels: 2 },
    high:  { audioBitrate: '256k', audioFrequency: 44100, audioChannels: 2 },
    medium:{ audioBitrate: '192k', audioFrequency: 44100, audioChannels: 2 },
    low:   { audioBitrate: '128k', audioFrequency: 44100, audioChannels: 2 }
  };
  const settings = qualitySettings[quality] || qualitySettings.ultra;

  jobs.set(jobId, { listeners: [], outputPath, outputFilename, status: 'processing' });

  res.json({ jobId, outputFilename });

  const broadcast = (data) => {
    const job = jobs.get(jobId);
    if (job) job.listeners.forEach(l => l(data));
  };

  ffmpeg(inputPath)
    .noVideo()
    .audioCodec('libmp3lame')
    .audioBitrate(settings.audioBitrate)
    .audioFrequency(settings.audioFrequency)
    .audioChannels(settings.audioChannels)
    .outputOptions(['-q:a 0', '-id3v2_version 3'])
    .output(outputPath)
    .on('progress', (progress) => {
      broadcast({
        type: 'progress',
        percent: Math.round(progress.percent || 0),
        timemark: progress.timemark
      });
    })
    .on('end', () => {
      broadcast({ type: 'done', filename: outputFilename });
      const job = jobs.get(jobId);
      if (job) job.status = 'done';
      // Clean up input file
      fs.unlink(inputPath, () => {});
    })
    .on('error', (err) => {
      broadcast({ type: 'error', message: err.message });
      const job = jobs.get(jobId);
      if (job) job.status = 'error';
      fs.unlink(inputPath, () => {});
    })
    .run();
});

app.get('/api/download/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(OUTPUTS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.download(filePath, filename, (err) => {
    if (!err) {
      setTimeout(() => fs.unlink(filePath, () => {}), 60000);
    }
  });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(400).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
