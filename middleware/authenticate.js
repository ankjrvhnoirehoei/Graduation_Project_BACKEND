// middleware/authenticate.js
const jwt = require('jsonwebtoken');
const User = require('../models/user-model');
const { jwtRefreshSecret } = require('../config');

async function authenticateRefreshToken(req, res, next) {
  try {
    // Extract the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authorization header missing or malformed" });
    }
    
    // Get the token from the header
    const token = authHeader.split(' ')[1];
    console.log("Token received:", token); // Debug: log token
    if (!token) {
      return res.status(401).json({ message: "Token is missing" });
    }
    
    // Verify the token using jwtRefreshSecret
    const decoded = jwt.verify(token, jwtRefreshSecret);
    console.log("Decoded token payload:", decoded); // Debug: log decoded payload
    
    // Retrieve the user from the database using the decoded info
    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== token) {
        console.log("User not found with ID:", decoded.id);
      return res.status(401).json({ message: "Invalid token" });
    }
    console.log("User found:", user); // Debug: log user data
    
    // Attach user info to request for downstream usage
    req.user = user;
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(401).json({ message: "Authentication failed" });
  }
}

module.exports = authenticateRefreshToken;
