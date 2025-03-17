const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const cors = require('cors');
const AppError = require('./utils/AppError');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// Global middlewares
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Security middlewares
app.use(helmet());
app.use(mongoSanitize()); // Against NoSQL injection
app.use(cors());
app.options('*', cors());

// Rate limiting
const limiter = rateLimit({
  max: 100,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many requests from this IP, please try again in an hour!',
});
app.use('/api', limiter);

// Routes
const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');
// const campaignsRouter = require('./routes/campaigns');
// const adminsRouter = require('./routes/admins');
// const donationsRouter = require('./routes/donations');
// const visualsRouter = require('./routes/visuals');

app.use('/', indexRouter);
app.use('/api/v1/user', usersRouter);
// app.use('/api/v1/campaigns', campaignsRouter);
// app.use('/api/v1/admins', adminsRouter);
// app.use('/api/v1/donations', donationsRouter);
// app.use('/api/v1/visuals', visualsRouter);

// Catch 404 and forward to error handler
app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server`, 404));
});

// Global error handler
app.use((err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log the error for debugging
  console.error(err);

  // Send JSON response for API errors
  if (req.originalUrl.startsWith('/api')) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  }

  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
  });
});

// Connect to MongoDB and start the server
const PORT = process.env.PORT || 5000;
const DB_PRODUCTION = process.env.DB_URL;

mongoose
  .connect(process.env.DB_TEST)
  .then(() => {
    console.log('Database connected');
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Database connection error:', err);
    process.exit(1);
  });

module.exports = app;