const mongoose = require('mongoose');
const Schema = mongoose.Schema; //equals connection in mongodb
const ObjectId = Schema.ObjectId;
const User = new Schema({
    id: {type: ObjectId},
    userID: {type: String},  
    fullName: {type: String}
});

module.exports = mongoose.models.User || mongoose.model('User', User);