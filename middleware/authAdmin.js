const jwt = require('jsonwebtoken');
const Admin = require('../models/admin-model');
const { jwtAccessSecret } = require('../config');

async function authenticateAccessToken(req, res, next) {
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
    
    // Verify the token using jwtAccessSecret
    const decoded = jwt.verify(token, jwtAccessSecret);
    console.log("Decoded token payload:", decoded); // Debug: log decoded payload
    
    // Retrieve the admin from the database using the decoded info
    const admin = await Admin.findById(decoded.id);
    if (!admin) {
        console.log("Admin not found with ID:", decoded.id);
      return res.status(401).json({ message: "Invalid token" });
    }
    console.log("Admin found:", admin); // Debug: log admin data
    
    // Attach admin info to request for downstream usage
    req.admin = admin;
    next();
  } catch (error){
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: "Token expired" });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: "Invalid token" });
    }
    console.error("Authentication error:", error);
    return res.status(401).json({ message: "Authentication failed" });
  }
}

module.exports = authenticateAccessToken;
