require('dotenv').config();
module.exports = {
    SECRETKEY: process.env.SECRETKEY,
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'fallbackAccessSecret',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'fallbackRefreshSecret',
    accessTokenLife: process.env.ACCESS_TOKEN_LIFE || '5m',
    refreshTokenLife: process.env.REFRESH_TOKEN_LIFE || '7d',
    cloudinaryConfig: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        apiSecret: process.env.CLOUDINARY_API_SECRET,
    },
    emailConfirmationSecret: process.env.EMAIL_CONFIRMATION_SECRET || 'fallbackEmailSecret',
}
