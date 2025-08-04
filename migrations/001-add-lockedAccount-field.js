const mongoose = require('mongoose');
require('dotenv').config();
const Admin = require('../models/admin-model');
const User = require('../models/user-model');
const Campaign = require('../models/campaign-model');

const DB_URL = process.env.DB_URL;

async function runMigration() {
  try {
    await mongoose.connect(DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Perform the migration:
    // Add "lockedAccount" field to any Admin and User that doesn't have it, defaulting to false
    const adminsToUpdate = await Admin.countDocuments({
      $or: [{ lockedAccount: { $exists: false } }, { lockedAccount: null }]
    });
    const usersToUpdate = await User.countDocuments({
      $or: [{ lockedAccount: { $exists: false } }, { lockedAccount: null }]
    });
    console.log(`Admins missing lockedAccount: ${adminsToUpdate}`);
    console.log(`Users missing lockedAccount: ${usersToUpdate}`);

    const usersCampToUpdate = await User.countDocuments({
      $or: [{ joinedCampaigns: { $exists: false } }, { joinedCampaigns: null }]
    });
    console.log(`Users missing joinedCampaigns: ${usersCampToUpdate}`);

    const campsToUpdate = await Campaign.countDocuments({
      $or: [{ volunteers: { $exists: false } }, { volunteers: null }]
    });
    console.log(`Campaigns missing volunteers: ${campsToUpdate}`);
  
    // Perform the migration
    const result1 = await Admin.updateMany(
      { $or: [{ lockedAccount: { $exists: false } }, { lockedAccount: null }] },
      { $set: { lockedAccount: false } }
    );
  
    const result2 = await User.updateMany(
      { $or: [{ lockedAccount: { $exists: false } }, { lockedAccount: null }] },
      { $set: { lockedAccount: false } }
    );

    const result3 = await Campaign.updateMany(
      { $or: [{ volunteers: { $exists: false } }, { volunteers: null }] },
      { $set: { volunteers: [] } }
    );

    const result4 = await User.updateMany(
      { $or: [{ joinedCampaigns: { $exists: false } }, { joinedCampaigns: null }] },
      { $set: { joinedCampaigns: [] } }
    );
  
    console.log('Migration result admin:', result1);
    console.log('Migration result user:', result2);
    console.log('Migration result campaign.volunteers:', result3);
    console.log('Migration result user.joinedCampaigns:', result4);
    
    // Close the connection
    await mongoose.connection.close();
    console.log('Connection closed. Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration if this script is called directly from Node
if (require.main === module) {
  runMigration();
}

module.exports = runMigration;

