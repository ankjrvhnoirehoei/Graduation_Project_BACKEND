const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const limiter = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('mongo-sanitize');
const cors = require('cors');
dotenv.config();

require('./models/user-models');

var usersRouter = require('./routes/users');
var campaignsRouter = require('./routes/campaigns');
var adminsRouter = require('./routes/admins');
var donationsRouter = require('./routes/donations');
var visualsRouter = require('./routes/visuals');

const app = express();

mongoose.connect(process.env.DB_URL).then(() => console.log("Database connected"));

// Litmit access request from the same IP
const limiter = rateLitmit({
  max: 100,
  windowMs: 60 * 60 * 1000,
  message: 'Too many request from this IP, please try again in an hour!'
});

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// GLOBAL MIDDLEWARES
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', limiter); // This one effect all of the routes basically start with '/api'
app.use(helmet()); // SET SECURERITY HTTP HEADERS
app.use(mongoSanitize()); // Prohibited SQL Injection
app.use(cors());          // Protect headers properties from hacker
app.options('*' ,cors()); // Protect headers properties for all API calls

// ROUTES
const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');
const campaignsRouter = require('./routes/campaigns');
const adminsRouter = require('./routes/admins');
const donationsRouter = require('./routes/donations');
const visualsRouter = require('./routes/visuals');

app.use('/home', indexRouter);
app.use('/users', usersRouter);
app.use('/campaigns', campaignsRouter);
app.use('/admins', adminsRouter);
app.use('/donations', donationsRouter);
app.use('/visuals', visualsRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;