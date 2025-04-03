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
dotenv.config();

require('./models/user-model');
require('./models/visual-model');
require('./models/admin-model');
require('./models/campaign-model');
require('./models/donation-model');

const app = express();

// Litmit access request from the same IP
const limiter = rateLimit({
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
app.use(helmet()); 
app.use(mongoSanitize());
app.use(cors());          
app.options('*', cors()); 

// ROUTES
const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');
const campaignsRouter = require('./routes/campaigns');
const adminsRouter = require('./routes/admins');
const donationsRouter = require('./routes/donations');
const visualsRouter = require('./routes/visuals');
const refreshTokenRouter = require('./routes/accessTokenRenewal');

app.use('/api/home', indexRouter);
app.use('/api/users', usersRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/admins', adminsRouter);
app.use('/api/donations', donationsRouter);
app.use('/api/visuals', visualsRouter);
app.use('/api', refreshTokenRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

//
mongoose
  .connect(process.env.DB_URL)
  .then(() => console.log("Database connected"));

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server is running on PORT: ${port}`);
});

module.exports = app;