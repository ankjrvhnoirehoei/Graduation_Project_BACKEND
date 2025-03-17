const User = require('../models/user-model');
const catchAsync = require('../utils/CatchAsync');
const AppError = require('../utils/AppError');

const UserController = {
  getByID: catchAsync(async (req, res, next) => {
    const { userID } = req.params;

    const user = await User.findOne({ userID: userID });

    if (!user) {
      return next(new AppError(`No user found with userID ${userID}`, 404));
    }

    const userRes = user.toObject();
    delete userRes.password;
    delete userRes.refreshToken;

    res.status(200).json({ message: 'Successful', user: userRes });
  }),

  getAll: catchAsync(async (req, res, next) => {
    const users = await User.find();
    res.status(200).json({ message: 'Success', users: users });
  }),
};

module.exports = UserController;