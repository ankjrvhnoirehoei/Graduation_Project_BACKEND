const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/user-model');

passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "/api/users/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user already exists with this Google ID
      let existingUser = await User.findOne({ googleId: profile.id });
      
      if (existingUser) {
        return done(null, existingUser);
      }

      // Check if user exists with the same email (to link accounts)
      const existingEmailUser = await User.findOne({ email: profile.emails[0].value });
      
      if (existingEmailUser) {
        // Link the Google account to existing user
        existingEmailUser.googleId = profile.id;
        existingEmailUser.loginMethod = 'google';
        if (!existingEmailUser.fullName) existingEmailUser.fullName = profile.displayName;
        if (!existingEmailUser.avatarImg) existingEmailUser.avatarImg = profile.photos[0].value;
        await existingEmailUser.save();
        return done(null, existingEmailUser);
      }

      // Create new user
      const newUser = new User({
        googleId: profile.id,
        fullName: profile.displayName,
        email: profile.emails[0].value,
        avatarImg: profile.photos[0].value,
        loginMethod: 'google'
      });

      await newUser.save();
      return done(null, newUser);
    } catch (error) {
      return done(error, null);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;