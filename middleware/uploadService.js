// utils/upload.js
const AppError = require('../utils/AppError');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(), // Saving media files in RAM instead of ROM
  limits: { 
    fileSize: 100 * 1024 * 1024 // Limited 100MB
  },
  fileFilter: (req, file, cb) => {
    try {
      // Kiểm tra loại file
      const isValidType = file.mimetype.startsWith('image/') ||
                          file.mimetype.startsWith('video/');
      if (!isValidType) {
        throw new AppError('Only JPEG/PNG or MP4/MOV files are acceptable.', 400);
      }

      // Validate the media file's size.
      if (file.size > 100 * 1024 * 1024) {
        throw new AppError(`The media file's size is not larger than 100MB`, 413);
      }

      cb(null, true); // Legal
    } catch (error) {
      cb(error, false); // Illegal and pass the error into callback
    }
  }
}).array('mediaFiles', 10); // limited 10 files

module.exports = upload;