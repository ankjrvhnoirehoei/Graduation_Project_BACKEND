const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const UserController = require('../controllers/userController');

router.post('/signup', AuthController.signUp);
router.post('/login', AuthController.login);
router.get('/:userID', AuthController.protect, UserController.getByID);
router.get('/', AuthController.protect, UserController.getAll);

module.exports = router;